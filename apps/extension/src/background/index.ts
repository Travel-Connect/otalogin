/**
 * Background Service Worker
 * ポータルからのメッセージを受信し、ログイン処理を調整する
 */

import type {
  ExtensionMessage,
  DispatchLoginPayload,
  ExtensionResponse,
  JobCredentials,
} from '@otalogin/shared';

// 設定
const CONFIG = {
  portalUrl: 'http://localhost:4000', // TODO: 環境変数から取得
  apiBaseUrl: 'http://localhost:4000/api',
};

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

// 開発用: 初回起動時に自動でトークンを設定
(async function initDevMode() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.deviceToken);
  if (!result[STORAGE_KEYS.deviceToken]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.deviceToken]: 'dev-token-12345',
      [STORAGE_KEYS.deviceName]: '開発PC',
      [STORAGE_KEYS.pollingEnabled]: true,
    });
    console.log('[DEV] 開発用トークンを自動設定しました');
  }
  // portalUrl は常に CONFIG に合わせて更新（開発中のポート変更に対応）
  await chrome.storage.local.set({
    [STORAGE_KEYS.portalUrl]: CONFIG.portalUrl,
  });
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
    const response = await fetch(`${CONFIG.apiBaseUrl}/extension/jobs`, {
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
      await processHealthCheckJob(job, windowId, deviceToken);
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
  deviceToken: string
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
      await reportJobResultWithCode(job.id, 'failed', 'NETWORK_ERROR', result.message);
      return;
    }

    // 成功: credentials を取得
    const credentials = result.credentials;

    // タブを作成してログイン実行
    const tab = await chrome.tabs.create({
      url: credentials.login_url,
      windowId: windowId,
      active: false,
    });

    if (!tab.id) {
      await reportJobResultWithCode(job.id, 'failed', 'UNKNOWN', 'タブ作成失敗');
      return;
    }

    // タブの読み込み完了を待つ
    await waitForTabLoad(tab.id);

    // Content Script にログイン情報を送信
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_LOGIN',
        payload: {
          job_id: credentials.job_id,
          channel_code: credentials.channel_code,
          login_id: credentials.login_id,
          password: credentials.password,
          extra_fields: credentials.extra_fields,
        },
      });
    } catch {
      // Content script にメッセージを送れない場合
      await reportJobResultWithCode(job.id, 'failed', 'UI_CHANGED', 'Content Scriptとの通信失敗');
      await chrome.tabs.remove(tab.id);
      return;
    }

    // 結果を待つ（Content Script から報告される）
    // タイムアウト処理は Content Script 側で行う

    const durationMs = Date.now() - startTime;
    console.log(`[HealthCheck] ジョブ ${job.id} 開始 (${durationMs}ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await reportJobResultWithCode(job.id, 'failed', 'UNKNOWN', message);
  }
}

/**
 * エラーコード付きでジョブ結果を報告
 */
async function reportJobResultWithCode(
  jobId: string,
  status: 'success' | 'failed',
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const deviceToken = await getDeviceToken();
  if (!deviceToken) return;

  await fetch(`${CONFIG.apiBaseUrl}/extension/report`, {
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
      return { success: false, error: `Failed to fetch job: ${result.message}` };
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
    const response = await fetch(
      `${CONFIG.apiBaseUrl}/extension/job/${jobId}`,
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

  await fetch(`${CONFIG.apiBaseUrl}/extension/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify(result),
  });
}
