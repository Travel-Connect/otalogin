/**
 * Background Service Worker
 * ポータルからのメッセージを受信し、ログイン処理を調整する
 */

import type {
  ExtensionMessage,
  DispatchLoginPayload,
  SyncUrlQueryPayload,
  ExtensionResponse,
  JobCredentials,
} from '@otalogin/shared';
import { extractAndSanitizeQuery } from '@otalogin/shared';

// デフォルト設定（ストレージにportal_urlがない場合のフォールバック）
const DEFAULT_PORTAL_URL = 'http://localhost:4000';

/**
 * ストレージからポータルURLを取得し、API Base URLを返す
 */
async function getApiBaseUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.portalUrl);
  const portalUrl = result[STORAGE_KEYS.portalUrl] || DEFAULT_PORTAL_URL;
  return `${portalUrl}/api`;
}

// ストレージキー
const STORAGE_KEYS = {
  deviceToken: 'device_token',
  deviceName: 'device_name',
  portalUrl: 'portal_url',
  monitorWindowId: 'monitor_window_id',
  pollingEnabled: 'polling_enabled',
};

// ポーリング設定
const POLLING_ALARM_NAME = 'job-polling';
const POLLING_INTERVAL_MINUTES = 1;

// 処理中フラグ（並列実行防止）
let isProcessingJobs = false;

// 初回起動時の初期化
(async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.deviceToken, STORAGE_KEYS.portalUrl]);
  if (!result[STORAGE_KEYS.deviceToken]) {
    // トークン未設定時はポーリングのみ有効化（ペアリングで正式トークンが設定される）
    await chrome.storage.local.set({
      [STORAGE_KEYS.pollingEnabled]: true,
    });
  }
  // portalUrl が未設定の場合のみデフォルトを設定（ペアリング済みの場合は上書きしない）
  if (!result[STORAGE_KEYS.portalUrl]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.portalUrl]: DEFAULT_PORTAL_URL,
    });
  }
  // ポーリングを開始
  await setupPollingAlarm();
})();

/**
 * ポーリングアラームをセットアップ
 */
async function setupPollingAlarm(): Promise<void> {
  const storage = await chrome.storage.local.get(STORAGE_KEYS.pollingEnabled);
  if (storage[STORAGE_KEYS.pollingEnabled]) {
    await chrome.alarms.create(POLLING_ALARM_NAME, {
      periodInMinutes: POLLING_INTERVAL_MINUTES,
    });
    console.log('[Polling] アラームを設定しました');
  }
}

/**
 * アラームハンドラ
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLLING_ALARM_NAME) {
    await pollAndProcessJobs();
  }
});

/**
 * ジョブをポーリングして処理
 */
async function pollAndProcessJobs(): Promise<void> {
  if (isProcessingJobs) {
    console.log('[Polling] 処理中のためスキップ');
    return;
  }

  const deviceToken = await getDeviceToken();
  if (!deviceToken) {
    console.log('[Polling] トークンがないためスキップ');
    return;
  }

  isProcessingJobs = true;
  console.log('[Polling] ジョブをチェック中...');

  try {
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/extension/jobs`, {
      headers: { Authorization: `Bearer ${deviceToken}` },
    });

    if (!response.ok) {
      console.error('[Polling] ジョブ取得失敗:', response.status);
      return;
    }

    const data = await response.json();
    const allJobs = data.jobs || [];

    // ポーリングでは health_check のみ処理（manual_login は DISPATCH_LOGIN 経由のみ）
    const jobs = allJobs.filter(
      (job: { job_type: string }) => job.job_type === 'health_check'
    );

    if (jobs.length === 0) {
      console.log('[Polling] 待機中の health_check ジョブなし');
      return;
    }

    console.log(`[Polling] ${jobs.length} 件の health_check ジョブを処理`);

    // 監視ウィンドウを取得または作成
    const windowId = await getOrCreateMonitorWindow();
    if (!windowId) {
      console.error('[Polling] 監視ウィンドウを取得できません');
      return;
    }

    // ジョブを順次処理（1件ずつ）
    for (const job of jobs) {
      await processHealthCheckJob(job, windowId, deviceToken, apiBaseUrl);
      // レート制限のため少し待機
      await sleep(3000);
    }
  } catch (error) {
    console.error('[Polling] エラー:', error);
  } finally {
    isProcessingJobs = false;
  }
}

/**
 * 監視ウィンドウを取得または作成
 */
async function getOrCreateMonitorWindow(): Promise<number | null> {
  const storage = await chrome.storage.local.get(STORAGE_KEYS.monitorWindowId);
  const savedWindowId = storage[STORAGE_KEYS.monitorWindowId];

  // 保存されたウィンドウが存在するか確認
  if (savedWindowId) {
    try {
      const win = await chrome.windows.get(savedWindowId);
      if (win) return savedWindowId;
    } catch {
      // ウィンドウが存在しない
    }
  }

  // 新しいウィンドウを作成
  try {
    const newWindow = await chrome.windows.create({
      url: 'about:blank',
      type: 'normal',
      focused: false,
    });
    if (newWindow.id) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.monitorWindowId]: newWindow.id,
      });
      return newWindow.id;
    }
  } catch (error) {
    console.error('[Monitor] ウィンドウ作成失敗:', error);
  }

  return null;
}

/**
 * ヘルスチェックジョブを処理
 */
async function processHealthCheckJob(
  job: { id: string; login_url?: string; channel_code?: string },
  windowId: number,
  deviceToken: string,
  apiBaseUrl: string,
): Promise<void> {
  const startTime = Date.now();

  try {
    // ジョブの詳細を取得（claim も同時に行われる）
    const result = await fetchJobCredentials(job.id, deviceToken);

    // 409 Conflict: 既に他でclaim済み - 安全にスキップ（エラー報告不要）
    if (result.status === 'conflict') {
      return;
    }

    // 401: 認証エラー
    if (result.status === 'unauthorized') {
      console.error('[HealthCheck] 認証エラー - トークンが無効です');
      return;
    }

    // その他のエラー
    if (result.status === 'error') {
      await reportJobResultWithCode(job.id, 'failed', 'NETWORK_ERROR', result.message, deviceToken, apiBaseUrl);
      return;
    }

    // 成功: credentials を取得
    const credentials = result.credentials;

    // リダイレクト対策: タブ作成前に pending_job を保存
    // sendMessage が失敗しても、Content Script が checkPendingLoginSuccess で拾える
    await chrome.storage.local.set({
      pending_job: {
        job_id: credentials.job_id,
        channel_code: credentials.channel_code,
        login_id: credentials.login_id,
        password: credentials.password,
        extra_fields: credentials.extra_fields,
        expires_at: Date.now() + 120000, // 2分間有効
      },
    });
    console.log(`[HealthCheck] pending_job を保存 (job: ${job.id})`);

    // タブを作成してログイン実行
    const tab = await chrome.tabs.create({
      url: credentials.login_url,
      windowId: windowId,
      active: false,
    });

    if (!tab.id) {
      await chrome.storage.local.remove('pending_job');
      await reportJobResultWithCode(job.id, 'failed', 'UNKNOWN', `step=tab_open, detail=タブ作成失敗`, deviceToken, apiBaseUrl);
      return;
    }

    // タブの読み込み完了を待つ（リダイレクト対応版）
    await waitForTabLoadWithRedirects(tab.id);

    // Content Script にログイン情報を送信（リトライ付き）
    const sent = await sendMessageWithRetry(tab.id, {
      type: 'EXECUTE_LOGIN',
      payload: {
        job_id: credentials.job_id,
        channel_code: credentials.channel_code,
        login_id: credentials.login_id,
        password: credentials.password,
        extra_fields: credentials.extra_fields,
      },
    }, 2);

    if (sent) {
      // sendMessage 成功 → pending_job は Content Script 側で消費される
      const durationMs = Date.now() - startTime;
      console.log(`[HealthCheck] ジョブ ${job.id} 開始 (${durationMs}ms)`);
    } else {
      // sendMessage 失敗 → pending_job フォールバックに頼る
      console.log(`[HealthCheck] sendMessage 失敗、pending_job フォールバックを使用 (job: ${job.id})`);
    }

    // 結果を待つ（Content Script から報告される）
    // タイムアウト処理は Content Script 側で行う
  } catch (error) {
    await chrome.storage.local.remove('pending_job');
    const message = error instanceof Error ? error.message : 'Unknown error';
    await reportJobResultWithCode(job.id, 'failed', 'UNKNOWN', message, deviceToken, apiBaseUrl);
  }
}

/**
 * エラーコード付きでジョブ結果を報告
 */
async function reportJobResultWithCode(
  jobId: string,
  status: 'success' | 'failed',
  errorCode?: string,
  errorMessage?: string,
  cachedDeviceToken?: string,
  cachedApiBaseUrl?: string,
): Promise<void> {
  const deviceToken = cachedDeviceToken || await getDeviceToken();
  if (!deviceToken) return;

  const apiBaseUrl = cachedApiBaseUrl || await getApiBaseUrl();
  await fetch(`${apiBaseUrl}/extension/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({
      job_id: jobId,
      status,
      error_code: errorCode,
      error_message: errorMessage,
    }),
  });
}

/**
 * スリープ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * デバイストークンを取得
 */
async function getDeviceToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.deviceToken);
  return result[STORAGE_KEYS.deviceToken] || null;
}

/**
 * 外部メッセージ（ポータルから）のハンドラ
 */
chrome.runtime.onMessageExternal.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    handleExternalMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    // 非同期レスポンスのために true を返す
    return true;
  }
);

/**
 * 外部メッセージの処理
 */
async function handleExternalMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'PING':
      return { success: true, data: { status: 'pong' } };

    case 'GET_STATUS':
      return await getExtensionStatus();

    case 'DISPATCH_LOGIN':
      return await handleDispatchLogin(
        message.payload as DispatchLoginPayload,
        sender
      );

    case 'SYNC_URL_QUERY':
      return await handleSyncUrlQuery(
        message.payload as SyncUrlQueryPayload,
        sender
      );

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

/**
 * 拡張の状態を取得
 */
async function getExtensionStatus(): Promise<ExtensionResponse> {
  const deviceToken = await getDeviceToken();
  const storage = await chrome.storage.local.get([
    STORAGE_KEYS.deviceName,
    STORAGE_KEYS.portalUrl,
  ]);

  return {
    success: true,
    data: {
      paired: !!deviceToken,
      device_name: storage[STORAGE_KEYS.deviceName] || null,
      portal_url: storage[STORAGE_KEYS.portalUrl] || null,
      pending_jobs: 0, // TODO: 保留中ジョブのカウント
    },
  };
}

/**
 * ログイン実行の処理
 * 重要: sender.tab.windowId を使って同一ウィンドウにタブを追加
 */
async function handleDispatchLogin(
  payload: DispatchLoginPayload,
  sender: chrome.runtime.MessageSender
): Promise<ExtensionResponse> {
  const { job_id } = payload;

  try {
    // 新しいジョブを開始する前に、古いpending状態をクリア
    // これにより、以前のジョブの残骸が新しいジョブに影響しないようにする
    await chrome.storage.local.remove(['pending_job', 'pending_login_check']);
    console.log('[DISPATCH_LOGIN] Cleared old pending states');

    const deviceToken = await getDeviceToken();
    if (!deviceToken) {
      return { success: false, error: 'Device not paired' };
    }

    // ジョブの詳細（資格情報）を取得（claim も同時に行われる）
    const result = await fetchJobCredentials(job_id, deviceToken);

    // 409 Conflict: 既に他でclaim済み
    if (result.status === 'conflict') {
      console.log(`[DISPATCH_LOGIN] ジョブ ${job_id} は既にclaim済み`);
      return { success: false, error: 'Job already claimed by another agent' };
    }

    // 401: 認証エラー
    if (result.status === 'unauthorized') {
      return { success: false, error: 'Authentication failed - invalid token' };
    }

    // その他のエラー
    if (result.status === 'error') {
      return { success: false, error: `step=fetch_credentials, detail=Failed to fetch job: ${result.message}` };
    }

    // 成功: credentials を取得
    const credentials = result.credentials;

    // 同一ウィンドウにタブを追加
    const windowId = sender.tab?.windowId;
    if (!windowId) {
      return { success: false, error: 'Could not determine window ID' };
    }

    // リダイレクト対策: タブ作成前に pending_job を保存
    // ページがリダイレクトされて EXECUTE_LOGIN が届かなくても、
    // リダイレクト先の content script が checkPendingLoginSuccess で拾える
    await chrome.storage.local.set({
      pending_job: {
        job_id: credentials.job_id,
        channel_code: credentials.channel_code,
        login_id: credentials.login_id,
        password: credentials.password,
        extra_fields: credentials.extra_fields,
        expires_at: Date.now() + 60000,
      },
    });
    console.log('[DISPATCH_LOGIN] Saved pending_job to storage (redirect safety net)');

    const tab = await chrome.tabs.create({
      url: credentials.login_url,
      windowId: windowId, // 重要: 同じウィンドウにタブを追加
      active: true,
    });

    // Content Script にログイン情報を送信
    // タブの読み込み完了を待ってから送信
    await waitForTabLoad(tab.id!);

    // EXECUTE_LOGIN を送信（リダイレクトで content script に届かない場合もある）
    try {
      await chrome.tabs.sendMessage(tab.id!, {
        type: 'EXECUTE_LOGIN',
        payload: {
          job_id: credentials.job_id,
          channel_code: credentials.channel_code,
          login_id: credentials.login_id,
          password: credentials.password,
          extra_fields: credentials.extra_fields,
        },
      });
    } catch (sendError) {
      // Content script がまだ準備できていない or ページがリダイレクト中
      // pending_job がストレージにあるので、次のページの content script が処理する
      console.log('[DISPATCH_LOGIN] sendMessage failed, relying on pending_job:', sendError);
    }

    return { success: true, data: { tab_id: tab.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * アクティブタブのURLクエリパラメータを取得してサニタイズ
 */
async function handleSyncUrlQuery(
  payload: SyncUrlQueryPayload,
  sender: chrome.runtime.MessageSender
): Promise<ExtensionResponse> {
  try {
    const windowId = sender.tab?.windowId;
    if (!windowId) {
      return { success: false, error: 'ウィンドウIDを特定できません' };
    }

    // 同一ウィンドウのアクティブタブを取得
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (!activeTab?.url) {
      return { success: false, error: 'アクティブタブのURLを取得できません' };
    }

    const sanitized = extractAndSanitizeQuery(activeTab.url, payload.allowed_domains);
    if (sanitized === null) {
      return {
        success: false,
        error: 'アクティブタブのドメインが許可リストに含まれていません',
      };
    }

    const data = Object.keys(sanitized).length > 0 ? sanitized : null;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * ジョブ資格情報取得の結果
 */
type FetchCredentialsResult =
  | { status: 'success'; credentials: JobCredentials }
  | { status: 'conflict' }  // 409: 既に他でclaim済み
  | { status: 'unauthorized' }  // 401: 認証失敗
  | { status: 'error'; message: string };

/**
 * APIからジョブの資格情報を取得
 */
async function fetchJobCredentials(
  jobId: string,
  deviceToken: string
): Promise<FetchCredentialsResult> {
  try {
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(
      `${apiBaseUrl}/extension/job/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${deviceToken}`,
        },
      }
    );

    if (response.status === 409) {
      // 既に他の拡張でclaim済み - 安全にスキップ
      console.log(`[Job] ジョブ ${jobId} は既にclaim済みのためスキップ`);
      return { status: 'conflict' };
    }

    if (response.status === 401) {
      return { status: 'unauthorized' };
    }

    if (!response.ok) {
      return { status: 'error', message: `HTTP ${response.status}` };
    }

    const credentials = await response.json();
    return { status: 'success', credentials };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { status: 'error', message };
  }
}

/**
 * タブの読み込み完了を待つ
 */
function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // タイムアウト（30秒）
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

/**
 * リダイレクト対応版: タブの読み込み完了を待つ
 * 最後の 'complete' から 500ms 安定したら完了とみなす（リダイレクト中の中間 complete を無視）
 */
function waitForTabLoadWithRedirects(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId !== tabId) return;

      if (changeInfo.status === 'complete') {
        // リダイレクト中の中間 complete を無視するためデバウンス
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(finish, 500);
      } else if (changeInfo.status === 'loading') {
        // リダイレクトが始まった → デバウンスタイマーをリセット
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // 既に complete の場合のチェック
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        debounceTimer = setTimeout(finish, 500);
      }
    }).catch(() => finish());

    // タイムアウト（30秒）
    setTimeout(finish, 30000);
  });
}

/**
 * Content Script へのメッセージ送信（リトライ付き）
 * 1.5s → 3s → 6s のバックオフでリトライ
 */
async function sendMessageWithRetry(
  tabId: number,
  message: object,
  maxRetries = 3
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch {
      const waitMs = 1500 * Math.pow(2, i);
      console.log(`[HealthCheck] sendMessage リトライ ${i + 1}/${maxRetries} (${waitMs}ms 後)`);
      await sleep(waitMs);
    }
  }
  return false;
}


/**
 * 内部メッセージ（Content Script / Popup から）のハンドラ
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    switch (message.type) {
      case 'LOGIN_RESULT':
        reportJobResult(message.payload as {
          job_id: string;
          status: 'success' | 'failed';
          error_code?: string;
          error_message?: string;
        })
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }));
        return true;

      case 'SET_MONITOR_WINDOW':
        // 現在のウィンドウを監視ウィンドウに設定
        if (sender.tab?.windowId) {
          chrome.storage.local.set({
            [STORAGE_KEYS.monitorWindowId]: sender.tab.windowId,
          }).then(() => {
            console.log('[Monitor] 監視ウィンドウを設定:', sender.tab?.windowId);
            sendResponse({ success: true, windowId: sender.tab?.windowId });
          });
        } else {
          sendResponse({ success: false, error: 'Window ID not found' });
        }
        return true;

      case 'GET_MONITOR_STATUS':
        chrome.storage.local.get([
          STORAGE_KEYS.monitorWindowId,
          STORAGE_KEYS.pollingEnabled,
        ]).then((storage) => {
          sendResponse({
            success: true,
            monitorWindowId: storage[STORAGE_KEYS.monitorWindowId],
            pollingEnabled: storage[STORAGE_KEYS.pollingEnabled],
          });
        });
        return true;

      case 'TOGGLE_POLLING':
        chrome.storage.local.get(STORAGE_KEYS.pollingEnabled).then(async (storage) => {
          const newState = !storage[STORAGE_KEYS.pollingEnabled];
          await chrome.storage.local.set({ [STORAGE_KEYS.pollingEnabled]: newState });
          if (newState) {
            await setupPollingAlarm();
          } else {
            await chrome.alarms.clear(POLLING_ALARM_NAME);
          }
          sendResponse({ success: true, pollingEnabled: newState });
        });
        return true;

      case 'MANUAL_POLL':
        // 手動でポーリングを実行
        pollAndProcessJobs()
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }));
        return true;

      case 'NEPPAN_PASSWORD_ALERTS':
        // ねっぱん top.php から抽出したPW経過日数データをAPIに送信
        handleNeppanPasswordAlerts(
          message.payload as { alerts: Array<{ site_name: string; elapsed_text: string }> },
          sender
        )
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }));
        return true;
    }
  }
);

/**
 * ジョブ結果をAPIに報告
 * Content Script からの error_code を優先して送信
 */
async function reportJobResult(result: {
  job_id: string;
  status: 'success' | 'failed';
  error_code?: string;
  error_message?: string;
}): Promise<void> {
  const deviceToken = await getDeviceToken();
  if (!deviceToken) return;

  const apiBaseUrl = await getApiBaseUrl();
  await fetch(`${apiBaseUrl}/extension/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify(result),
  });
}

/**
 * ねっぱん top.php から抽出したPW経過日数データをAPIに送信
 * sender.tab.url からホスト名を特定し、施設IDの解決はAPI側で行う
 */
async function handleNeppanPasswordAlerts(
  payload: { alerts: Array<{ site_name: string; elapsed_text: string }> },
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const deviceToken = await getDeviceToken();
  if (!deviceToken) return;

  const tabUrl = sender.tab?.url;
  if (!tabUrl) return;

  // www{N}.neppan.net からホスト名を取得（施設特定用）
  const hostname = new URL(tabUrl).hostname;

  console.log('[NeppanAlerts] Sending password alerts:', payload.alerts.length, 'items from', hostname);

  const apiBaseUrl = await getApiBaseUrl();
  await fetch(`${apiBaseUrl}/extension/neppan-alerts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({
      hostname,
      alerts: payload.alerts,
    }),
  });
}
