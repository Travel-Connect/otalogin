/**
 * ねっぱん パスワードローテーションのメインループ。
 *
 * フロー:
 *   1. ログイン
 *   2. モーダル検出 → 「次へ」
 *   3. ラウンド 1..N: 現在PW → 連番PW
 *   4. 最終復帰: 現在PW → 元PW (P0)
 *      - 過去10回ロックで失敗したら追加ランダム変更でリトライ（最大+3）
 *   5. 完了ログ
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { loadNeppanCredentials, maskPassword, type NeppanCredentials } from './lib/credentials';
import { loginToNeppan } from './lib/login';
import {
  isPasswordAlertModalOpen,
  clickNextInModal,
  navigateToUpdatePage,
  fillPasswordUpdateForm,
  checkPolicyIndicators,
  submitAndWaitForCompletion,
} from './lib/page-actions';
import {
  sequentialPassword,
  resolveSuffix,
  validatePolicy,
} from './lib/password-gen';
import { RotationLogger } from './lib/log';
import { markRotation } from './lib/rotation-state';

export interface RotateOptions {
  facility: string;
  count: number;
  live: boolean;
  dryRun: boolean;
  logsDir: string;
  /** モーダル検知をスキップして直接 operatorPasswordUpdate.php に遷移する。rotate-all 向け。 */
  skipModalCheck?: boolean;
  /** ログファイル名の prefix（rotate-all 等で施設ごとに区別するため） */
  logPrefix?: string;
}

const MAX_RESTORE_RETRY = 3;

export async function rotate(opts: RotateOptions): Promise<void> {
  const logger = new RotationLogger(opts.logsDir, opts.logPrefix ?? opts.facility);
  console.log(`[rotator] log file: ${logger.path}`);

  const creds = await loadNeppanCredentials(opts.facility);
  console.log(`[rotator] facility: ${creds.facility_name} (${creds.facility_code})`);
  console.log(`[rotator] login_id: ${creds.login_id}`);
  console.log(`[rotator] password: ${maskPassword(creds.password)}`);
  console.log(`[rotator] count: ${opts.count} (= ${opts.count} rotations + 1 restore)`);
  console.log(`[rotator] mode: ${opts.dryRun ? 'DRY-RUN' : opts.live ? 'LIVE' : 'NO-SUBMIT (safety)'}`);

  const startDate = new Date();
  const suffix = resolveSuffix(creds.password, new Set(), startDate, opts.count);
  console.log(`[rotator] suffix: ${suffix}`);

  logger.append({
    event: 'start',
    facility: opts.facility,
    count: opts.count,
    initial_pw: creds.password,
    suffix,
  });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // コンソール / ネットワークの最低限ログ（機密情報が出ない範囲）
  page.on('pageerror', (err) => console.error('[page-error]', err.message));

  try {
    console.log('[rotator] step 1/4: logging in...');
    await loginToNeppan(page, creds);
    logger.append({ event: 'login', result: 'success' });
    console.log(`[rotator] post-login url: ${page.url()}`);

    if (opts.skipModalCheck) {
      console.log('[rotator] step 2/4: skipping modal check, navigating directly to update page...');
      logger.append({ event: 'modal_not_detected' });
      await navigateToUpdatePage(page);
    } else {
      console.log('[rotator] step 2/4: detecting password alert modal...');
      await page.waitForTimeout(3000);
      const modalOpen = await isPasswordAlertModalOpen(page);

      if (modalOpen) {
        console.log('[rotator] modal detected. clicking 次へ...');
        logger.append({ event: 'modal_detected' });
        await clickNextInModal(page);
      } else {
        console.log('[rotator] modal NOT detected. navigating directly to update page...');
        logger.append({ event: 'modal_not_detected' });
        await navigateToUpdatePage(page);
      }
    }

    console.log(`[rotator] at: ${page.url()}`);

    // メインループ
    let currentPw = creds.password;

    console.log(`[rotator] step 3/4: ${opts.count} rotations...`);
    for (let round = 1; round <= opts.count; round++) {
      const newPw = sequentialPassword(startDate, round, suffix);
      const policy = validatePolicy(newPw);
      if (!policy.ok) {
        throw new Error(`Generated password fails local policy check: ${policy.failed.join(', ')}`);
      }

      console.log(`[rotator] round ${round}/${opts.count}: ${maskPassword(currentPw)} -> ${maskPassword(newPw)}`);

      const result = await runRound(page, currentPw, newPw, opts.dryRun);

      if (result === 'dry-run-ok') {
        // dry-run は 1 ラウンドだけ検証して終了
        logger.append({
          event: 'rotate',
          round,
          from_pw: currentPw,
          to_pw: newPw,
          result: 'success',
          message: 'DRY-RUN: form filled, policy indicators OK, did not submit',
        });
        console.log('[rotator] ✅ dry-run successful. no password was changed.');
        if (opts.logPrefix) {
          // bulk 実行時は次の施設に進むために即終了
          console.log('[rotator] (bulk mode: closing browser to proceed to next facility)');
        } else {
          // 単独実行時は目視確認のため少し待機（5秒）してから閉じる
          console.log('[rotator] waiting 5s for visual inspection...');
          await page.waitForTimeout(5000).catch(() => {});
        }
        return;
      }

      if (result.ok) {
        logger.append({
          event: 'rotate',
          round,
          from_pw: currentPw,
          to_pw: newPw,
          result: 'success',
        });
        currentPw = newPw;
        // 次ラウンドの update ページへ
        if (round < opts.count) {
          await navigateToUpdatePage(page);
        }
      } else {
        logger.append({
          event: 'rotate',
          round,
          from_pw: currentPw,
          to_pw: newPw,
          result: 'failed',
          message: result.error,
        });
        logger.append({
          event: 'abort',
          reason: `round ${round} failed: ${result.error}`,
          current_pw: currentPw,
        });
        throw new Error(`Round ${round} failed: ${result.error} (url=${result.url})`);
      }
    }

    // 最終復帰
    console.log(`[rotator] step 4/4: restore to original pw...`);
    await navigateToUpdatePage(page);

    let restoreAttempt = 0;
    while (restoreAttempt <= MAX_RESTORE_RETRY) {
      const restoreResult = await runRound(page, currentPw, creds.password, false);

      if (restoreResult === 'dry-run-ok') {
        // 到達しないはず
        throw new Error('unexpected dry-run result during restore');
      }

      if (restoreResult.ok) {
        logger.append({
          event: 'restore',
          from_pw: currentPw,
          to_pw: creds.password,
          result: 'success',
          retry: restoreAttempt,
        });
        currentPw = creds.password;
        console.log('[rotator] ✅ restored to original password.');
        break;
      }

      // 復帰失敗: 過去10回ロックの可能性 → 追加ラウンドでリトライ
      console.log(`[rotator] restore failed (attempt ${restoreAttempt + 1}): ${restoreResult.error}`);
      logger.append({
        event: 'restore',
        from_pw: currentPw,
        to_pw: creds.password,
        result: 'failed',
        message: restoreResult.error,
        retry: restoreAttempt,
      });

      restoreAttempt++;
      if (restoreAttempt > MAX_RESTORE_RETRY) {
        logger.append({
          event: 'manual_action_required',
          current_pw: currentPw,
          reason: `restore failed after ${MAX_RESTORE_RETRY} retries: ${restoreResult.error}`,
        });
        throw new Error(
          `Restore failed after ${MAX_RESTORE_RETRY} retries. Current PW is "${currentPw}". ` +
            `Manual action required: update Supabase with this PW and retry later.`,
        );
      }

      // 追加ラウンドを挿入（P0 を履歴から押し出すため）
      const extraRound = opts.count + restoreAttempt;
      const extraPw = sequentialPassword(startDate, extraRound, suffix);
      console.log(`[rotator] inserting extra round ${extraRound}: ${maskPassword(currentPw)} -> ${maskPassword(extraPw)}`);
      await navigateToUpdatePage(page);
      const extraResult = await runRound(page, currentPw, extraPw, false);
      if (extraResult === 'dry-run-ok' || !('ok' in extraResult) || !extraResult.ok) {
        const err = extraResult === 'dry-run-ok' ? 'unexpected dry-run' : extraResult.error;
        logger.append({
          event: 'rotate',
          round: extraRound,
          from_pw: currentPw,
          to_pw: extraPw,
          result: 'failed',
          message: err,
        });
        logger.append({
          event: 'manual_action_required',
          current_pw: currentPw,
          reason: `extra round ${extraRound} failed: ${err}`,
        });
        throw new Error(`Extra round ${extraRound} failed: ${err}. Current PW is "${currentPw}".`);
      }
      logger.append({
        event: 'rotate',
        round: extraRound,
        from_pw: currentPw,
        to_pw: extraPw,
        result: 'success',
        message: 'extra round inserted for restore retry',
      });
      currentPw = extraPw;
      await navigateToUpdatePage(page);
    }

    logger.append({
      event: 'complete',
      final_pw: currentPw,
      matches_initial: currentPw === creds.password,
    });

    if (currentPw !== creds.password) {
      throw new Error(`Final PW does not match initial PW. Current: "${currentPw}"`);
    }

    console.log('[rotator] ✅ rotation complete. password is back to original.');
    console.log(`[rotator] log: ${logger.path}`);

    // live モード成功時のみ DB の last_rotated_at を更新（dry-run では更新しない）
    if (opts.live && !opts.dryRun) {
      try {
        await markRotation({
          facilityCode: opts.facility,
          status: 'success',
          error: null,
          logPath: logger.path,
          bumpRotatedAt: true,
          incrementCount: true,
        });
        console.log('[rotator] DB: neppan_password_rotations updated (last_rotated_at = now)');
      } catch (dbErr) {
        // DB 記録の失敗は本処理を成功扱いにしつつ警告にとどめる
        // （ねっぱん側のローテーションは既に完了しているため、再実行は不要）
        console.error('[rotator] ⚠️ failed to update neppan_password_rotations:', dbErr);
      }
    }
  } catch (err) {
    console.error('[rotator] ❌ error:', err);
    // live モード失敗時も DB に failed を記録しておく（rotate-due の判定材料になる）
    if (opts.live && !opts.dryRun) {
      try {
        await markRotation({
          facilityCode: opts.facility,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          logPath: logger.path,
          bumpRotatedAt: false,
          incrementCount: false,
        });
      } catch (dbErr) {
        console.error('[rotator] ⚠️ failed to record failure status:', dbErr);
      }
    }
    throw err;
  } finally {
    // 少し待機してユーザーが最終状態を目視できるようにする
    await page.waitForTimeout(3000).catch(() => {});
    await browser.close();
  }
}

/**
 * 1 ラウンドの実行。
 *   - dryRun=true のときはフォーム入力とポリシー span 確認だけ、登録は押さない
 *   - それ以外は登録まで実行し、完了ページ到達で success
 */
async function runRound(
  page: Page,
  nowPw: string,
  newPw: string,
  dryRun: boolean,
): Promise<'dry-run-ok' | { ok: true } | { ok: false; error: string; url: string }> {
  await fillPasswordUpdateForm(page, nowPw, newPw);

  // ローカルポリシー充足を JS 側で確認
  const policy = await checkPolicyIndicators(page);
  if (!policy.ok) {
    return {
      ok: false,
      error: `policy indicators not all OK: ${JSON.stringify(policy.details)}`,
      url: page.url(),
    };
  }

  if (dryRun) {
    return 'dry-run-ok';
  }

  const result = await submitAndWaitForCompletion(page);
  return result;
}
