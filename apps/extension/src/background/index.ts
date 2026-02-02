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
  portalUrl: 'http://localhost:3000', // TODO: 環境変数から取得
  apiBaseUrl: 'http://localhost:3000/api',
};

// ストレージキー
const STORAGE_KEYS = {
  deviceToken: 'device_token',
  deviceName: 'device_name',
  portalUrl: 'portal_url',
};

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
  const { job_id, channel_code, facility_id } = payload;

  try {
    const deviceToken = await getDeviceToken();
    if (!deviceToken) {
      return { success: false, error: 'Device not paired' };
    }

    // ジョブの詳細（資格情報）を取得
    const credentials = await fetchJobCredentials(job_id, deviceToken);
    if (!credentials) {
      return { success: false, error: 'Failed to fetch job credentials' };
    }

    // 同一ウィンドウにタブを追加
    const windowId = sender.tab?.windowId;
    if (!windowId) {
      return { success: false, error: 'Could not determine window ID' };
    }

    const tab = await chrome.tabs.create({
      url: credentials.login_url,
      windowId: windowId, // 重要: 同じウィンドウにタブを追加
      active: true,
    });

    // Content Script にログイン情報を送信
    // タブの読み込み完了を待ってから送信
    await waitForTabLoad(tab.id!);

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

    return { success: true, data: { tab_id: tab.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * APIからジョブの資格情報を取得
 */
async function fetchJobCredentials(
  jobId: string,
  deviceToken: string
): Promise<JobCredentials | null> {
  try {
    const response = await fetch(
      `${CONFIG.apiBaseUrl}/extension/job/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${deviceToken}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
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
 * 内部メッセージ（Content Script から）のハンドラ
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (message.type === 'LOGIN_RESULT') {
      reportJobResult(message.payload as {
        job_id: string;
        status: 'success' | 'failed';
        error_message?: string;
      })
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }
  }
);

/**
 * ジョブ結果をAPIに報告
 */
async function reportJobResult(result: {
  job_id: string;
  status: 'success' | 'failed';
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
