/**
 * Content Script
 * OTAサイト上でログイン処理を実行する
 */

import { CHANNEL_CONFIGS, type ChannelConfig, type PostLoginAction } from '@otalogin/shared';
import type { ChannelCode, ErrorCode } from '@otalogin/shared';

interface LoginPayload {
  job_id: string;
  channel_code: ChannelCode;
  login_id: string;
  password: string;
  extra_fields: Record<string, string>;
}

interface PendingLoginCheck {
  job_id: string;
  channel_code: ChannelCode;
  success_indicator: string;
  extra_fields: Record<string, string>;
  post_login_action?: PostLoginAction;
  expires_at: number;
}

/**
 * リダイレクト対策: 受け取ったジョブ情報を保存
 */
interface PendingJob {
  job_id: string;
  channel_code: ChannelCode;
  login_id: string;
  password: string;
  extra_fields: Record<string, string>;
  expires_at: number;
}

/**
 * ページ読み込み時に、リダイレクト後のログイン成功チェックと施設選択を行う
 */
async function checkPendingLoginSuccess(): Promise<void> {
  console.log('[OTALogin] checkPendingLoginSuccess called on:', window.location.href);

  // 「ようこそ」ページ（get-started）の場合、ログインボタンを自動クリック
  // pending状態はそのまま保持し、次のページで処理を継続する
  if (window.location.href.includes('/get-started')) {
    console.log('[OTALogin] Detected get-started page, clicking login button');
    const loginBtn = document.querySelector('button[type="submit"], a[href*="login"], button') as HTMLElement | null;
    if (loginBtn) {
      await sleep(300);
      clickElement(loginBtn);
      return; // ページ遷移するので、ここで処理を終了
    }
  }

  // pending_job をチェック（リダイレクトで EXECUTE_LOGIN が届かなかった場合のフォールバック）
  const jobResult = await chrome.storage.local.get('pending_job');
  const pendingJob = jobResult.pending_job as PendingJob | undefined;

  if (pendingJob && Date.now() <= pendingJob.expires_at) {
    const pendingConfig = CHANNEL_CONFIGS[pendingJob.channel_code];

    if (window.self === window.top) {
      // トップフレーム: EXECUTE_LOGIN を先に待つ（タブ読み込み完了後すぐ送信されるため500msで十分）
      console.log('[OTALogin] Found pending_job, waiting for EXECUTE_LOGIN message first...');
      await sleep(500);

      const recheck = await chrome.storage.local.get('pending_job');
      const stillPending = recheck.pending_job as PendingJob | undefined;

      if (stillPending && stillPending.job_id === pendingJob.job_id) {
        const hasFormInTopFrame = pendingConfig ? checkLoginFormExists(pendingConfig) : false;
        if (hasFormInTopFrame) {
          console.log('[OTALogin] Handling pending_job in top frame:', pendingJob.job_id);
          await chrome.storage.local.remove('pending_job');
          await executeLogin({
            job_id: pendingJob.job_id,
            channel_code: pendingJob.channel_code,
            login_id: pendingJob.login_id,
            password: pendingJob.password,
            extra_fields: pendingJob.extra_fields,
          });
          return;
        } else if (pendingConfig?.success_indicator) {
          // ログインフォームが無いが、success_indicator が存在する場合は既にログイン済み
          // → ログインステップをスキップして post_login_action を直接実行
          // React SPAはレンダリングに時間がかかるため、success_indicatorの出現を待つ
          console.log('[OTALogin] Login form not found, checking if already logged in (waiting for success_indicator)...');
          const successEl = await waitForElement(pendingConfig.success_indicator, 10000);
          if (successEl && pendingConfig.post_login_action) {
            console.log('[OTALogin] Already logged in (success_indicator present), executing post_login_action directly');
            await chrome.storage.local.remove('pending_job');
            const actionResult = await executePostLoginAction(
              pendingConfig.post_login_action,
              pendingJob.extra_fields,
            );
            if (actionResult.success) {
              await reportResult(pendingJob.job_id, 'success');
            } else {
              await reportResult(pendingJob.job_id, 'failed', 'UI_CHANGED', actionResult.error, 'post_login_action');
            }
            return;
          } else {
            console.log('[OTALogin] Login form not in top frame (likely in iframe), skipping pending_job fallback');
          }
        } else {
          console.log('[OTALogin] Login form not in top frame (likely in iframe), skipping pending_job fallback');
        }
      } else {
        console.log('[OTALogin] pending_job already consumed by EXECUTE_LOGIN');
      }
    } else {
      // iframe: ログインフォームがこのiframe内にある場合のみ処理
      // React SPAはレンダリングに時間がかかるため、フォームが描画されるまで待機
      if (pendingConfig) {
        const firstSelector = pendingConfig.login_steps?.[0]?.input || pendingConfig.selectors?.username;
        if (firstSelector) {
          console.log('[OTALogin] iframe: checking pending_job, waiting for form render...');
          const formEl = await waitForElement(firstSelector, 10000);
          if (formEl) {
            // フォームが見つかった → pending_job がまだ残っているか再チェック
            const recheck = await chrome.storage.local.get('pending_job');
            const stillPending = recheck.pending_job as PendingJob | undefined;
            if (stillPending && stillPending.job_id === pendingJob.job_id) {
              console.log('[OTALogin] iframe: handling pending_job:', pendingJob.job_id);
              await chrome.storage.local.remove('pending_job');
              await executeLogin({
                job_id: pendingJob.job_id,
                channel_code: pendingJob.channel_code,
                login_id: pendingJob.login_id,
                password: pendingJob.password,
                extra_fields: pendingJob.extra_fields,
              });
              return;
            } else {
              console.log('[OTALogin] iframe: pending_job already consumed');
            }
          } else {
            console.log('[OTALogin] iframe: form not found in this iframe, skipping');
          }
        }
      }
    }
  }

  // 次に pending_login_check をチェック（ログイン後のリダイレクト）
  const result = await chrome.storage.local.get('pending_login_check');
  const pending = result.pending_login_check as PendingLoginCheck | undefined;

  console.log('[OTALogin] pending_login_check:', pending);

  if (!pending) {
    console.log('[OTALogin] No pending login check found');
    return;
  }

  // 有効期限チェック（60秒）
  if (Date.now() > pending.expires_at) {
    await chrome.storage.local.remove('pending_login_check');
    return;
  }

  // 強制ログインチェック（ページリロード後に強制ログインページが表示される場合）
  const pendingConfig = CHANNEL_CONFIGS[pending.channel_code];
  if (pendingConfig) {
    const forceLoginHandled = await handleForceLogin(pendingConfig);
    if (forceLoginHandled) {
      console.log('[OTALogin] Force login button clicked, keeping pending_login_check for next page load');
      return; // 次のページロードで成功判定される
    }
  }

  // 成功インジケータをチェック
  console.log('[OTALogin] Checking success indicator:', pending.success_indicator);
  const success = await waitForLoginSuccess(pending.success_indicator, 15000);
  console.log('[OTALogin] Success indicator found:', success);

  if (success) {
    // ログイン成功 - post_login_action があれば実行
    if (pending.post_login_action) {
      console.log('[OTALogin] Executing post_login_action:', pending.post_login_action);
      console.log('[OTALogin] With extra_fields:', pending.extra_fields);
      const actionResult = await executePostLoginAction(
        pending.post_login_action,
        pending.extra_fields
      );
      console.log('[OTALogin] Post login action result:', actionResult);
      if (!actionResult.success) {
        await reportResult(pending.job_id, 'failed', 'UI_CHANGED', actionResult.error, 'post_login_action');
        await chrome.storage.local.remove('pending_login_check');
        return;
      }
    } else {
      console.log('[OTALogin] No post_login_action defined');
    }

    await reportResult(pending.job_id, 'success');
    await chrome.storage.local.remove('pending_login_check');
  } else {
    console.log('[OTALogin] Success indicator not found, checking fallback...');

    // フォールバック: ログインフォームが消えていれば成功とみなす
    // （リダイレクト先のページに success_indicator がなくても、ログインページから離れた = 成功）
    const config = CHANNEL_CONFIGS[pending.channel_code];
    if (config) {
      const loginFormStillPresent = checkLoginFormExists(config);

      // ページに「ログアウト」リンク/テキストがあれば確実にログイン成功
      const hasLogoutIndicator = detectLogoutPresence();
      if (hasLogoutIndicator) {
        console.log('[OTALogin] Logout indicator found on page → treating as success');
        if (pending.post_login_action) {
          const actionResult = await executePostLoginAction(
            pending.post_login_action,
            pending.extra_fields
          );
          if (!actionResult.success) {
            await reportResult(pending.job_id, 'failed', 'UI_CHANGED', actionResult.error, 'post_login_action');
            await chrome.storage.local.remove('pending_login_check');
            return;
          }
        }
        await reportResult(pending.job_id, 'success');
        await chrome.storage.local.remove('pending_login_check');
      } else if (!loginFormStillPresent) {
        // ログアウトもないがログインフォームも消えている → エラーチェック
        const authErrorMessage = detectAuthError();
        if (authErrorMessage) {
          console.log('[OTALogin] Auth error detected on page:', authErrorMessage);
          await reportResult(pending.job_id, 'failed', 'AUTH_FAILED', authErrorMessage, 'verify');
          await chrome.storage.local.remove('pending_login_check');
        } else {
          console.log('[OTALogin] Login form gone → treating as success (fallback)');
          if (pending.post_login_action) {
            const actionResult = await executePostLoginAction(
              pending.post_login_action,
              pending.extra_fields
            );
            if (!actionResult.success) {
              await reportResult(pending.job_id, 'failed', 'UI_CHANGED', actionResult.error, 'post_login_action');
              await chrome.storage.local.remove('pending_login_check');
              return;
            }
          }
          await reportResult(pending.job_id, 'success');
          await chrome.storage.local.remove('pending_login_check');
        }
      } else {
        console.log('[OTALogin] Login form still present, will retry on next page load');
      }
    } else {
      console.log('[OTALogin] Unknown channel, cannot determine login state');
    }
  }
}

/**
 * ログイン後のアクションを実行（施設選択など）
 */
async function executePostLoginAction(
  action: PostLoginAction,
  extra_fields: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  if (action.type === 'select_facility') {
    return await selectFacility(action, extra_fields);
  }
  return { success: true };
}

/**
 * 施設を選択
 */
async function selectFacility(
  action: PostLoginAction,
  extra_fields: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const facilityId = extra_fields[action.id_key];

  if (!facilityId) {
    return { success: false, error: `Facility ID not provided (key: ${action.id_key})` };
  }

  // ドロップダウン選択と検索入力を並行して行う
  const hasDropdown = !!action.dropdown_select;
  const hasSearch = !!action.search_input;
  const hasSearchButton = !!(action.search_input && action.search_submit);

  // 両方の要素を並行して取得
  const [dropdownTrigger, searchInput] = await Promise.all([
    hasDropdown ? waitForElement(action.dropdown_select!.trigger, 3000) : Promise.resolve(null),
    hasSearch ? waitForElement(action.search_input!, 5000) : Promise.resolve(null),
  ]);

  if (hasDropdown && !dropdownTrigger) {
    // ドロップダウンが見つからない場合はスキップ（既にログイン済みで別UIが表示される場合）
    console.log('[OTALogin] Dropdown trigger not found, skipping:', action.dropdown_select!.trigger);
  }
  if (hasSearch && !searchInput) {
    return { success: false, error: `Search input not found: ${action.search_input}` };
  }

  // 施設IDを先に入力（検索入力がある場合）
  // 入力は非同期で開始し、ドロップダウン操作と並行して行う
  let inputPromise: Promise<void> | null = null;
  if (hasSearch && searchInput) {
    inputPromise = typeIntoField(searchInput, facilityId);
  }

  // ドロップダウン選択（入力と並行して実行）
  if (hasDropdown && dropdownTrigger) {
    // React Selectの場合、コントロール部分をクリックして開く
    const container = dropdownTrigger.closest('.css-b62m3t-container');
    const control = container?.querySelector('[class*="control"]') || container || dropdownTrigger;

    // フォーカスしてからクリック
    (dropdownTrigger as HTMLElement).focus();
    clickElement(control as HTMLElement);
    await sleep(50);

    // マウスダウンイベントも発火（React Selectはこれを使う場合がある）
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(150);

    // オプションメニューが表示されるまで待機
    const menuSelectors = [
      '[class*="menu"] [class*="option"]',
      '[id*="react-select"][id*="option"]',
      '[class*="MenuList"] > div',
      '[role="listbox"] [role="option"]',
    ];

    let options: Element[] | null = null;
    for (const selector of menuSelectors) {
      options = await waitForElements(selector, 500);
      if (options && options.length > 0) {
        break;
      }
    }

    if (!options || options.length === 0) {
      // キーボードナビゲーションを試す
      (dropdownTrigger as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      );
      await sleep(150);

      // 再度オプションを探す
      for (const selector of menuSelectors) {
        options = await waitForElements(selector, 500);
        if (options && options.length > 0) break;
      }
    }

    if (!options || options.length === 0) {
      console.log('[OTALogin] Still no options found');
      return { success: false, error: 'Dropdown options not found' };
    }

    // 指定されたテキストを持つオプションを探してクリック
    let targetOption: Element | null = null;
    for (const option of options) {
      const text = (option as HTMLElement).innerText || '';
      if (text.includes(action.dropdown_select!.option_text)) {
        targetOption = option;
        break;
      }
    }

    if (!targetOption) {
      return { success: false, error: `Dropdown option not found: ${action.dropdown_select!.option_text}` };
    }

    clickElement(targetOption as HTMLElement);
    await sleep(100);
  }

  // 入力完了を待機
  if (inputPromise) {
    await inputPromise;
  }

  // Enterキーで検索を実行するモード（るるぶ等）
  if (action.submit_with_enter && searchInput) {
    console.log('[OTALogin] Submitting facility search with Enter key');
    await sleep(300);
    (searchInput as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
    );
    (searchInput as HTMLElement).dispatchEvent(
      new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
    );
    (searchInput as HTMLElement).dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
    );

    // 検索結果が表示されるまで待機し、結果の行をクリック
    console.log('[OTALogin] Waiting for search results after Enter...');
    await sleep(2000);

    // 検索結果の行を探してクリック
    const resultRows = await waitForElements(action.row_selector, 5000);
    console.log('[OTALogin] Found', resultRows?.length || 0, 'result rows with selector:', action.row_selector);

    if (resultRows && resultRows.length > 0) {
      // 施設IDを含む行を探す（検索で1件に絞り込み済みなら最初の行）
      let targetRow = resultRows[0];
      for (const row of resultRows) {
        if ((row as HTMLElement).textContent?.includes(facilityId)) {
          targetRow = row;
          break;
        }
      }

      console.log('[OTALogin] Target row text:', (targetRow as HTMLElement).textContent?.trim().substring(0, 80));

      // 戦略1: 行内の <a href="..."> を見つけて直接ナビゲーション（最も確実）
      const anchor = targetRow.querySelector('a[href]') as HTMLAnchorElement | null;
      if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
        console.log('[OTALogin] Found anchor in row, navigating directly to:', anchor.href);
        window.location.href = anchor.href;
        await sleep(2000);
      } else {
        // 戦略2: 行をクリック（PointerEvent + MouseEvent でReact 17+対応）
        console.log('[OTALogin] No anchor found, trying click with PointerEvents on row');
        const clickTarget = targetRow as HTMLElement;
        clickTarget.scrollIntoView({ block: 'center' });
        await sleep(200);

        // PointerEvent（React 17+ はpointerdownで検出）
        for (const eventType of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const) {
          const EventClass = eventType.startsWith('pointer') ? PointerEvent : MouseEvent;
          clickTarget.dispatchEvent(
            new EventClass(eventType, { bubbles: true, cancelable: true, view: window })
          );
        }
        await sleep(1500);

        // ナビゲーションが発生しなかった場合、行内の各セルでも試す
        const startUrl = window.location.href;
        if (window.location.href === startUrl) {
          const cells = targetRow.querySelectorAll('td, [role="cell"]');
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i] as HTMLElement;
            console.log('[OTALogin] Trying click on cell', i, ':', cell.textContent?.trim().substring(0, 30));
            cell.click();
            cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
            cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            await sleep(800);
            if (window.location.href !== startUrl) {
              console.log('[OTALogin] Navigation detected after clicking cell', i);
              break;
            }
          }
        }
      }
      await sleep(1000);
    } else {
      // row_selectorでマッチしない場合のフォールバック
      // 施設コードを含む要素を直接探す
      console.log('[OTALogin] No rows found, searching for element containing facility ID:', facilityId);
      const allElements = document.querySelectorAll('td, [role="cell"], [role="gridcell"], [class*="cell"]');
      for (const el of allElements) {
        if ((el as HTMLElement).textContent?.trim() === facilityId) {
          // この要素の親行をクリック
          const parentRow = el.closest('tr, [role="row"]') as HTMLElement | null;
          if (parentRow) {
            const link = parentRow.querySelector('a, button') as HTMLElement | null;
            console.log('[OTALogin] Found facility cell, clicking parent row');
            clickElement(link || parentRow);
            await sleep(2000);
            break;
          }
        }
      }
    }
    return { success: true };
  }

  // 検索ボタンをクリック
  if (hasSearchButton) {
    const searchButton = await waitForElement(action.search_submit!, 2000);
    if (!searchButton) {
      return { success: false, error: `Search button not found: ${action.search_submit}` };
    }
    clickElement(searchButton as HTMLElement);

    // React SPAのre-renderを待つ（300msでは不十分な場合がある）
    await sleep(1000);
  }

  // 施設一覧の行が表示されるまで待機
  const rows = await waitForElements(action.row_selector, 5000);
  if (!rows || rows.length === 0) {
    return { success: false, error: 'Facility list not found' };
  }

  // 施設IDが一致する行を探す
  let targetRow: Element | null = null;
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length > action.id_column_index) {
      const cell = cells[action.id_column_index];
      const cellValue = cell.getAttribute('title') || cell.innerText || '';
      if (cellValue.trim() === facilityId.trim()) {
        targetRow = row;
        break;
      }
    }
  }

  // 最初の試行で見つからない場合、検索結果の更新を待って再試行
  if (!targetRow && hasSearch) {
    console.log('[OTALogin] Facility not found in first attempt, waiting for search results to update...');
    await sleep(2000);
    const retryRows = document.querySelectorAll(action.row_selector);
    for (const row of retryRows) {
      const cells = row.querySelectorAll('td');
      if (cells.length > action.id_column_index) {
        const cell = cells[action.id_column_index];
        const cellValue = cell.getAttribute('title') || (cell as HTMLElement).innerText || '';
        if (cellValue.trim() === facilityId.trim()) {
          targetRow = row;
          break;
        }
      }
    }
  }

  if (!targetRow) {
    return { success: false, error: `Facility not found: ${facilityId}` };
  }

  // 施設をクリック
  const clickTarget = targetRow.querySelector('td') || targetRow;
  clickElement(clickTarget as HTMLElement);

  // 少し待機（ページ遷移を待つ）
  await sleep(1000);

  return { success: true };
}

// ページ読み込み時にチェック
checkPendingLoginSuccess();

// ねっぱん top.php のPW経過日数を抽出
checkNeppanTopPage();

/**
 * Background からのメッセージを受信
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload: LoginPayload },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (message.type === 'EXECUTE_LOGIN') {
      const { channel_code } = message.payload;
      const config = CHANNEL_CONFIGS[channel_code];

      // all_frames: true のため複数フレームで実行される可能性がある
      // ログインフォームの要素が存在するフレームでのみ処理する
      // iframe内のReact SPAはレンダリングに時間がかかるため、非同期で待機する
      const handleMessage = async () => {
        if (config) {
          let hasForm = checkLoginFormExists(config);
          if (!hasForm) {
            // React SPAのレンダリングを待つ（iframe内等）
            const firstSelector = config.login_steps?.[0]?.input || config.selectors?.username;
            if (firstSelector) {
              console.log('[OTALogin] Form not found immediately, waiting for React render...');
              const el = await waitForElement(firstSelector, 8000);
              hasForm = !!el;
            }
          }
          if (!hasForm) {
            console.log('[OTALogin] Login form not found in this frame after waiting, skipping');
            return;
          }
        }

        const result = await executeLogin(message.payload);
        sendResponse(result);
      };

      handleMessage().catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
      return true; // 非同期レスポンスを許可
    }
  }
);

/**
 * 現在のフレームにログインフォームの要素が存在するかチェック
 */
function checkLoginFormExists(config: ChannelConfig): boolean {
  // マルチステップの場合は最初のステップの入力要素を確認
  if (config.login_steps && config.login_steps.length > 0) {
    const selector = config.login_steps[0].input;
    const firstInput = document.querySelector(selector);
    console.log('[OTALogin] checkLoginFormExists (multi-step): selector=', selector, 'found=', !!firstInput);
    if (firstInput) return true;
    // 成功インジケータが既にある場合も処理する（既にログイン済み）
    const successIndicator = config.success_indicator;
    if (successIndicator && document.querySelector(successIndicator)) return true;
    return false;
  }
  // シングルステップの場合はusername or success_indicatorを確認
  if (config.selectors) {
    const usernameInput = document.querySelector(config.selectors.username);
    if (usernameInput) return true;
    const successIndicator = config.success_indicator || config.selectors.success_indicator;
    if (successIndicator && document.querySelector(successIndicator)) return true;
  }
  return false;
}

/**
 * ログイン処理を実行
 */
async function executeLogin(payload: LoginPayload): Promise<{ success: boolean; error?: string }> {
  const { job_id, channel_code, login_id, password, extra_fields } = payload;

  console.log('[OTALogin] executeLogin called for job:', job_id, 'channel:', channel_code);

  const config = CHANNEL_CONFIGS[channel_code];
  if (!config) {
    await reportResult(job_id, 'failed', 'UNKNOWN', 'Unknown channel');
    return { success: false, error: 'Unknown channel' };
  }

  // pending_job をクリア（Background が事前保存したもの。再保存しない。）
  // これにより、ページリロード時の無限ループを防ぐ
  await chrome.storage.local.remove('pending_job');
  console.log('[OTALogin] Cleared pending_job from storage');

  try {
    let result: { success: boolean; error?: string };

    // マルチステップログインの場合
    if (config.login_steps && config.login_steps.length > 0) {
      result = await executeMultiStepLogin(job_id, channel_code, config, login_id, password, extra_fields);
    } else {
      // シングルステップログイン（従来の方式）
      result = await executeSingleStepLogin(job_id, config, login_id, password, extra_fields);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = inferErrorCode(message);
    await reportResult(job_id, 'failed', errorCode, message);
    return { success: false, error: message };
  }
}

/**
 * マルチステップログインを実行
 */
async function executeMultiStepLogin(
  job_id: string,
  channel_code: ChannelCode,
  config: ChannelConfig,
  login_id: string,
  password: string,
  extra_fields: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const steps = config.login_steps!;
  const values: Record<string, string> = {
    username: login_id,
    password: password,
    ...extra_fields,
  };

  // 既にログイン済みの場合（セッションが有効な場合）、成功インジケータが表示されているかチェック
  // または、ログインフォームが表示されているかチェック
  const alreadyLoggedInIndicator = config.success_indicator || config.selectors?.success_indicator;
  const firstStepInput = steps[0]?.input;

  if (alreadyLoggedInIndicator && firstStepInput) {
    // 成功インジケータまたはログインフォームのどちらかが表示されるまで待つ
    const combinedSelector = `${alreadyLoggedInIndicator}, ${firstStepInput}`;
    const foundElement = await waitForElement(combinedSelector, 5000);

    if (foundElement) {
      // 成功インジケータが見つかったか確認
      const alreadyLoggedIn = document.querySelector(alreadyLoggedInIndicator);
      if (alreadyLoggedIn) {
        console.log('[OTALogin] Already logged in, skipping login steps');
        // post_login_action があれば実行
        if (config.post_login_action) {
          const actionResult = await executePostLoginAction(config.post_login_action, extra_fields);
          if (!actionResult.success) {
            await reportResult(job_id, 'failed', 'UI_CHANGED', actionResult.error, 'post_login_action');
            return { success: false, error: actionResult.error };
          }
        }
        await reportResult(job_id, 'success');
        return { success: true };
      }
      console.log('[OTALogin] Login form found, proceeding with login steps');
    } else {
      console.log('[OTALogin] Neither success indicator nor login form found');
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLastStep = i === steps.length - 1;

    console.log(`[OTALogin] Step ${i + 1}/${steps.length}: looking for input: ${step.input}`);

    // 入力フィールドを待機
    const input = await waitForElement(step.input);
    if (!input) {
      // デバッグ: ページ上の input 要素を列挙
      const allInputs = document.querySelectorAll('input');
      console.log(`[OTALogin] Input not found. Page has ${allInputs.length} input elements:`);
      allInputs.forEach((inp, idx) => {
        const el = inp as HTMLInputElement;
        console.log(`[OTALogin]   input[${idx}]: type=${el.type} name=${el.name} id=${el.id} placeholder=${el.placeholder} data-cy=${el.getAttribute('data-cy')}`);
      });
      await reportResult(job_id, 'failed', 'UI_CHANGED', `Input not found: ${step.input}`, `multi_step_${i + 1}_form_fill`);
      return { success: false, error: `Input not found: ${step.input}` };
    }
    console.log(`[OTALogin] Input found:`, (input as HTMLElement).tagName, (input as HTMLInputElement).type, (input as HTMLInputElement).id || (input as HTMLInputElement).name);

    // 値を入力
    const value = values[step.value_key];
    if (!value) {
      await reportResult(job_id, 'failed', 'UNKNOWN', `Value not found for key: ${step.value_key}`, `multi_step_${i + 1}_form_fill`);
      return { success: false, error: `Value not found for key: ${step.value_key}` };
    }
    await typeIntoField(input, value);

    // 少し待機してからボタンをクリック（フォームの反応を待つ）
    await sleep(300);

    // ボタンをクリック
    console.log(`[OTALogin] Step ${i + 1}: looking for submit button: ${step.submit}`);
    const submitButton = await waitForElement(step.submit);
    if (!submitButton) {
      // デバッグ: ページ上の button 要素を列挙
      const allButtons = document.querySelectorAll('button');
      console.log(`[OTALogin] Submit not found. Page has ${allButtons.length} button elements:`);
      allButtons.forEach((btn, idx) => {
        const el = btn as HTMLElement;
        console.log(`[OTALogin]   button[${idx}]: type=${el.getAttribute('type')} text="${el.textContent?.trim().substring(0, 50)}" class="${el.className.substring(0, 80)}" data-cy=${el.getAttribute('data-cy')}`);
      });
      await reportResult(job_id, 'failed', 'UI_CHANGED', `Submit button not found: ${step.submit}`, `multi_step_${i + 1}_submit`);
      return { success: false, error: `Submit button not found: ${step.submit}` };
    }
    console.log(`[OTALogin] Submit button found:`, (submitButton as HTMLElement).tagName, (submitButton as HTMLElement).textContent?.trim().substring(0, 30));

    // 最後のステップの場合、クリック前にpending_login_checkを保存（リダイレクト対策）
    if (isLastStep) {
      const successIndicator = config.success_indicator || config.selectors?.success_indicator;
      if (successIndicator) {
        const timeoutMs = config.pending_timeout_ms || 60000;
        const pendingCheck: PendingLoginCheck = {
          job_id,
          channel_code,
          success_indicator: successIndicator,
          extra_fields,
          post_login_action: config.post_login_action,
          expires_at: Date.now() + timeoutMs,
        };
        console.log('[OTALogin] Saving pending_login_check BEFORE final click (timeout:', timeoutMs, 'ms):', pendingCheck);
        await chrome.storage.local.set({ pending_login_check: pendingCheck });
        console.log('[OTALogin] pending_login_check saved successfully');
      }
    }

    clickElement(submitButton as HTMLElement);

    // 最後のステップでない場合、次のステップを待機
    if (!isLastStep) {
      const waitSelector = step.wait_for || steps[i + 1].input;
      const nextElement = await waitForElement(waitSelector, 15000);
      if (!nextElement) {
        await reportResult(job_id, 'failed', 'TIMEOUT', `Next step not appeared: ${waitSelector}`, `multi_step_${i + 1}_wait_next`);
        return { success: false, error: `Next step not appeared: ${waitSelector}` };
      }
      // 要素が表示されるまで少し待機
      await sleep(500);
    }
  }

  // 最後のステップ後、リダイレクトを考慮した成功チェック
  // （pending_login_checkは既にクリック前に保存済み）
  const successIndicator = config.success_indicator || config.selectors?.success_indicator;
  if (!successIndicator) {
    // 成功インジケータが未定義の場合はすぐに成功とみなす
    await reportResult(job_id, 'success');
    return { success: true };
  }

  console.log('[OTALogin] Waiting for success indicator or redirect...');

  // ページ内での成功チェック（リダイレクト前に成功インジケータが出る場合）
  const immediateSuccess = await waitForLoginSuccess(successIndicator, 5000);
  if (immediateSuccess) {
    console.log('[OTALogin] Immediate success detected');
    // post_login_action があれば実行
    if (config.post_login_action) {
      const actionResult = await executePostLoginAction(config.post_login_action, extra_fields);
      if (!actionResult.success) {
        await chrome.storage.local.remove('pending_login_check');
        await reportResult(job_id, 'failed', 'UI_CHANGED', actionResult.error);
        return { success: false, error: actionResult.error };
      }
    }
    await chrome.storage.local.remove('pending_login_check');
    await reportResult(job_id, 'success');
    return { success: true };
  }

  // リダイレクトを待つ（URLが変わるか、成功インジケータが出現するまで）
  const success = await waitForLoginSuccessOrRedirect(successIndicator, 30000);

  if (success) {
    // post_login_action があれば実行
    if (config.post_login_action) {
      const actionResult = await executePostLoginAction(config.post_login_action, extra_fields);
      if (!actionResult.success) {
        await chrome.storage.local.remove('pending_login_check');
        await reportResult(job_id, 'failed', 'UI_CHANGED', actionResult.error);
        return { success: false, error: actionResult.error };
      }
    }
    await chrome.storage.local.remove('pending_login_check');
    await reportResult(job_id, 'success');
    return { success: true };
  }

  // ストレージにはまだ残っているので、リダイレクト先で再チェックされる
  return { success: true }; // Background側で結果を待つ
}

/**
 * シングルステップログインを実行（従来の方式）
 */
async function executeSingleStepLogin(
  job_id: string,
  config: ChannelConfig,
  login_id: string,
  password: string,
  extra_fields: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const selectors = config.selectors!;
  console.log('[OTALogin] executeSingleStepLogin started, selectors:', JSON.stringify({
    username: selectors.username,
    password: selectors.password,
    submit: selectors.submit,
  }));
  console.log('[OTALogin] login_id:', login_id ? '***set***' : '***empty***');
  console.log('[OTALogin] extra_fields:', JSON.stringify(Object.keys(extra_fields)));

  // ユーザー名を入力
  const usernameInput = await waitForElement(selectors.username);
  console.log('[OTALogin] usernameInput found:', !!usernameInput);
  if (!usernameInput) {
    await reportResult(job_id, 'failed', 'UI_CHANGED', 'Username input not found', 'form_fill');
    return { success: false, error: 'Username input not found' };
  }
  await typeIntoField(usernameInput, login_id);
  console.log('[OTALogin] username filled');

  // パスワードを入力
  const passwordInput = await waitForElement(selectors.password);
  console.log('[OTALogin] passwordInput found:', !!passwordInput);
  if (!passwordInput) {
    await reportResult(job_id, 'failed', 'UI_CHANGED', 'Password input not found', 'form_fill');
    return { success: false, error: 'Password input not found' };
  }
  await typeIntoField(passwordInput, password);
  console.log('[OTALogin] password filled');

  // 追加フィールドを入力（セレクタがある場合のみ）
  if (config.extra_fields) {
    for (const field of config.extra_fields) {
      const value = extra_fields[field.key];
      console.log('[OTALogin] extra field:', field.key, 'value:', value ? '***set***' : '***empty***', 'selector:', field.selector);
      if (value && field.selector) {
        const input = await waitForElement(field.selector);
        if (input) {
          await typeIntoField(input, value);
          console.log('[OTALogin] extra field filled:', field.key);
        }
      }
    }
  }

  // ログインボタンをクリック
  const submitButton = await waitForElement(selectors.submit);
  console.log('[OTALogin] submitButton found:', !!submitButton);
  if (!submitButton) {
    await reportResult(job_id, 'failed', 'UI_CHANGED', 'Submit button not found', 'submit');
    return { success: false, error: 'Submit button not found' };
  }

  // クリック前に pending_login_check を保存（ページリロード/リダイレクト対策）
  // ASP.NET WebFormsなどフルページリロードする場合、リロード後に成功判定を行う
  const successIndicator = config.success_indicator || selectors.success_indicator;
  if (successIndicator) {
    const timeoutMs = config.pending_timeout_ms || 60000;
    const pendingCheck: PendingLoginCheck = {
      job_id,
      channel_code: Object.keys(CHANNEL_CONFIGS).find(
        (key) => CHANNEL_CONFIGS[key as ChannelCode] === config
      ) as ChannelCode,
      success_indicator: successIndicator,
      extra_fields,
      expires_at: Date.now() + timeoutMs,
    };
    console.log('[OTALogin] Saving pending_login_check BEFORE submit click:', pendingCheck);
    await chrome.storage.local.set({ pending_login_check: pendingCheck });
  }

  clickElement(submitButton as HTMLElement);

  // ASP.NET WebForms フォールバック: clickElement でフォーム送信されない場合に備え、
  // __VIEWSTATE があるフォームは form.submit() も試す
  await sleep(500);
  const form = (submitButton as HTMLElement).closest('form') as HTMLFormElement | null;
  if (form && form.querySelector('input[name="__VIEWSTATE"]')) {
    // ページがまだ遷移していない場合（= submit が効いていない）
    if (document.contains(submitButton)) {
      console.log('[OTALogin] ASP.NET form detected, trying form.submit() fallback');
      try {
        form.submit();
      } catch (e) {
        console.log('[OTALogin] form.submit() fallback error:', e);
      }
    }
  }

  // 強制ログインチェック（リンカーン等: 既にログイン中の場合）
  // ページリロード前にチェック（同一ページで表示される場合）
  await sleep(1000);
  const forceLoginClicked = await handleForceLogin(config);
  if (forceLoginClicked) {
    console.log('[OTALogin] Force login button clicked, waiting for redirect...');
    // 強制ログイン後はページ遷移するので、pending_login_checkで処理
    return { success: true };
  }

  // ログイン成功の確認（ページがリロードしない場合はここで判定）
  const success = await waitForLoginSuccess(successIndicator, 15000);

  if (success) {
    await chrome.storage.local.remove('pending_login_check');
    await reportResult(job_id, 'success');
    return { success: true };
  } else {
    // ページがリロードした場合はここに到達しない（pending_login_checkで処理）
    // 到達した場合はタイムアウト or 認証エラー
    const authErrorMessage = detectAuthError();
    if (authErrorMessage) {
      await chrome.storage.local.remove('pending_login_check');
      await reportResult(job_id, 'failed', 'AUTH_FAILED', authErrorMessage, 'verify');
      return { success: false, error: authErrorMessage };
    }
    // フォールバック: ログインフォームが消えていれば成功とみなす
    const loginFormStillPresent = checkLoginFormExists(config);
    if (!loginFormStillPresent) {
      console.log('[OTALogin] Login form gone after submit → treating as success (fallback)');
      await chrome.storage.local.remove('pending_login_check');
      await reportResult(job_id, 'success');
      return { success: true };
    }
    // ログインフォームがまだ表示 → pending_login_checkが残っていればリロード先で再チェックされる
    return { success: true }; // Background側で結果を待つ
  }
}

/**
 * 強制ログインが必要かチェックし、必要なら強制ログインボタンをクリック
 * @returns true: 強制ログインボタンをクリックした, false: 不要
 */
async function handleForceLogin(config: ChannelConfig): Promise<boolean> {
  if (!config.force_login) return false;

  const bodyText = document.body?.innerText || '';
  if (!bodyText.includes(config.force_login.detect_text)) return false;

  console.log('[OTALogin] Force login page detected:', config.force_login.detect_text);

  // ボタンテキストに一致する要素を探す（a, button, input[type="submit"]）
  const clickables = document.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
  for (const el of clickables) {
    const text = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value?.trim() || '';
    if (text.includes(config.force_login.button_text)) {
      console.log('[OTALogin] Clicking force login button:', text);
      clickElement(el as HTMLElement);
      return true;
    }
  }

  console.log('[OTALogin] Force login button not found by text:', config.force_login.button_text);
  return false;
}

/**
 * エラーメッセージから error_code を推定
 */
function inferErrorCode(message: string): ErrorCode {
  if (message.includes('not found')) {
    return 'UI_CHANGED';
  }
  if (message.includes('timeout') || message.includes('Timeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('network') || message.includes('Network')) {
    return 'NETWORK_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * ページ上にログアウトリンク/テキストが存在するかを検出
 * ログアウトが存在する = ログイン成功している
 */
function detectLogoutPresence(): boolean {
  // セレクタベース
  const logoutSelectors = [
    'a[href*="logout"]',
    'a[href*="Logout"]',
    'a[href*="doLogout"]',
    'a[href*="signout"]',
    'a[href*="sign_out"]',
    '.logout',
    '#logout',
    '[data-action="logout"]',
  ];
  for (const selector of logoutSelectors) {
    if (document.querySelector(selector)) {
      console.log('[OTALogin] Logout element found via selector:', selector);
      return true;
    }
  }
  // テキストベース（リンクやボタンのテキストに「ログアウト」が含まれるか）
  const links = document.querySelectorAll('a, button');
  for (const el of links) {
    const text = el.textContent?.trim() || '';
    if (text === 'ログアウト' || text === 'Logout' || text === 'Sign Out') {
      console.log('[OTALogin] Logout text found in element:', text);
      return true;
    }
  }
  return false;
}

/**
 * ページ上に認証エラーが表示されているかを検出
 * エラーが見つかった場合はそのメッセージテキストを返す
 */
function detectAuthError(): string | null {
  // エラー表示に使われる一般的なセレクタ
  const errorSelectors = [
    '.error',
    '.error-message',
    '.alert-error',
    '.alert-danger',
    '[role="alert"]',
    '.login-error',
    '.auth-error',
    '#error',
    '.err',
    // Vue.js / SPA フレームワーク
    '.el-message--error',
    '.v-alert--error',
    '.toast-error',
    // ASP.NET
    '.validation-summary-errors',
    '#ValidationSummary',
    '[id*="validator"]',
    // 各OTA固有
    '.errMsg',         // じゃらん
    '#errMsg',         // ねっぱん
    '.text-danger',    // Bootstrap系
    '.text-red',       // Tailwind系
  ];

  for (const selector of errorSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent && element.textContent.trim().length > 0) {
      const text = element.textContent.trim();
      console.log('[OTALogin] Auth error detected via selector:', selector, 'text:', text);
      return text;
    }
  }

  const bodyText = document.body.innerText || '';
  const errorKeywords = [
    // 汎用（多くのOTAでマッチ）
    '正しくありません',
    'が違います',
    'が異なります',
    '一致しません',
    '間違っています',
    'ログインに失敗',
    'ログインできません',
    '認証に失敗',
    '認証エラー',
    'エラーが発生',
    '入力内容をご確認',
    '再度お試し',
    'もう一度入力',
    '無効です',
    '不正です',
    '存在しません',
    'アカウントがロック',
    'ロックされ',
    '回数を超え',
    // じゃらん
    'ユーザIDまたはパスワード',
    // 楽天
    '楽天会員',
    'パスワードに誤り',
    // ねっぱん
    '契約コード',
    'ログインIDまたは',
    // 一休（「施設IDまたは〜」のようなエラー文のみマッチさせる）
    '施設IDまたは',
    'オペレータIDまたは',
    '施設IDが正しくありません',
    // スカイチケット
    'ログイン情報',
    // 英語（念のため）
    'invalid credentials',
    'incorrect password',
    'authentication failed',
    'login failed',
    'account locked',
  ];

  for (const keyword of errorKeywords) {
    if (bodyText.includes(keyword)) {
      // マッチしたキーワード周辺のテキストを抽出（前後50文字）
      const idx = bodyText.indexOf(keyword);
      const start = Math.max(0, idx - 30);
      const end = Math.min(bodyText.length, idx + keyword.length + 50);
      const context = bodyText.substring(start, end).replace(/\s+/g, ' ').trim();
      console.log('[OTALogin] Auth error detected via keyword:', keyword, 'context:', context);
      return context;
    }
  }

  return null;
}

/**
 * スリープ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 要素の出現を待つ
 */
function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * 複数要素の出現を待つ
 */
function waitForElements(selector: string, timeout = 10000): Promise<Element[] | null> {
  return new Promise((resolve) => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      resolve(Array.from(elements));
      return;
    }

    const observer = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        observer.disconnect();
        resolve(Array.from(els));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * フィールドに入力
 * React SPA対応: ネイティブsetterを使ってReactの_valueTrackerをバイパス
 */
async function typeIntoField(element: Element, value: string): Promise<void> {
  const input = element as HTMLInputElement;
  input.focus();

  // React 16+ はinput.valueの直接代入を検知しない（_valueTrackerで管理）
  // ネイティブのsetterを使うことでReactの状態更新をトリガーする
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  const setter = input instanceof HTMLTextAreaElement
    ? nativeTextareaValueSetter
    : nativeInputValueSetter;

  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }

  // 値が設定されたか検証（フォールバック）
  if (input.value !== value) {
    console.log('[OTALogin] Native setter did not set value, using direct assignment');
    input.value = value;
  }

  // setAttribute も設定（ASP.NET WebForms等で必要な場合がある）
  input.setAttribute('value', value);

  // React synthetic event用にネイティブイベントを発火
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('[OTALogin] typeIntoField result: value set =', input.value === value, 'for', input.id || input.name);
}

/**
 * 要素をクリック（複数のイベントを発火）
 * ネイティブ .click() も併用して確実にクリックする
 */
function clickElement(element: HTMLElement): void {
  element.scrollIntoView({ block: 'center' });
  // まずネイティブ .click() を試す（ブラウザのデフォルトアクションを確実に発火）
  try {
    element.click();
  } catch (e) {
    console.log('[OTALogin] Native click() threw:', e);
  }
  // フォールバック: 合成イベントも発火（React/Vue SPA用）
  ['mousedown', 'mouseup', 'click'].forEach((eventType) => {
    element.dispatchEvent(
      new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
  });
}

/**
 * ログイン成功を待つ
 */
function waitForLoginSuccess(selector: string, timeout = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(true);
        return true;
      }
      return false;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeout);
  });
}

/**
 * ログイン成功またはリダイレクトを待つ
 */
function waitForLoginSuccessOrRedirect(selector: string, timeout = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const startUrl = window.location.href;

    const check = () => {
      const element = document.querySelector(selector);
      if (element) {
        return true;
      }
      return false;
    };

    if (check()) {
      resolve(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // URLの変更を監視
    const urlCheckInterval = setInterval(() => {
      if (window.location.href !== startUrl) {
        clearInterval(urlCheckInterval);
        // URLが変わった = リダイレクトが発生、新しいページでのチェックはページ読み込み時に行う
      }
    }, 100);

    setTimeout(() => {
      observer.disconnect();
      clearInterval(urlCheckInterval);
      resolve(false);
    }, timeout);
  });
}

/**
 * 結果をBackground Scriptに報告
 * 失敗時は自動的にページURL・タイトル・処理ステップを付与
 */
async function reportResult(
  jobId: string,
  status: 'success' | 'failed',
  errorCode?: ErrorCode,
  errorMessage?: string,
  step?: string
): Promise<void> {
  let finalMessage = errorMessage;
  if (status === 'failed' && errorMessage) {
    const parts = [`step=${step || 'unknown'}`];
    parts.push(`url=${window.location.href}`);
    parts.push(`title=${document.title || '(empty)'}`);
    parts.push(`detail=${errorMessage}`);
    finalMessage = parts.join(', ');
  }
  chrome.runtime.sendMessage({
    type: 'LOGIN_RESULT',
    payload: {
      job_id: jobId,
      status,
      error_code: errorCode,
      error_message: finalMessage,
    },
  });
}

/**
 * ねっぱん top.php からアラート情報を抽出
 * 標準3列（サイト名、巡回、直近巡回）以降にテキストがある場合に抽出する
 * パスワード変更経過日数以外のアラートにも対応
 */
function extractNeppanPasswordAlerts(): Array<{ site_name: string; elapsed_text: string }> {
  const alerts: Array<{ site_name: string; elapsed_text: string }> = [];
  const rows = document.querySelectorAll('#salesSiteItems tr');

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;

    // 1列目: サイト名
    const nameEl = cells[0].querySelector('#salesSiteName');
    const siteName = nameEl?.textContent?.trim();
    if (!siteName) continue;

    // 4列目以降: アラートテキスト（列が存在しテキストがある場合のみ）
    const extraTexts: string[] = [];
    for (let i = 3; i < cells.length; i++) {
      const text = cells[i]?.textContent?.trim();
      if (text) {
        extraTexts.push(text);
      }
    }

    if (extraTexts.length > 0) {
      alerts.push({ site_name: siteName, elapsed_text: extraTexts.join(' / ') });
    }
  }

  return alerts;
}

/**
 * ねっぱん top.php を検出し、PW経過日数データを抽出してBackground Scriptに送信
 */
async function checkNeppanTopPage(): Promise<void> {
  // neppan.net/top.php のみ対象
  if (!window.location.hostname.includes('neppan.net')) return;
  if (!window.location.pathname.includes('top.php')) return;
  if (window.self !== window.top) return; // iframe内は対象外

  console.log('[OTALogin] Neppan top.php detected, extracting password alerts...');

  // テーブルが描画されるまで少し待機
  await sleep(2000);

  const alerts = extractNeppanPasswordAlerts();
  if (alerts.length === 0) {
    console.log('[OTALogin] No password alerts found on Neppan top page');
    return;
  }

  console.log('[OTALogin] Neppan password alerts extracted:', alerts);

  chrome.runtime.sendMessage({
    type: 'NEPPAN_PASSWORD_ALERTS',
    payload: { alerts },
  });
}
