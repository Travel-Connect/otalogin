/**
 * Popup Script
 * 拡張のポップアップUIを制御
 */

const STORAGE_KEYS = {
  deviceToken: 'device_token',
  deviceName: 'device_name',
  portalUrl: 'portal_url',
  monitorWindowId: 'monitor_window_id',
  pollingEnabled: 'polling_enabled',
};

/**
 * 初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
  await updateUI();

  const pairBtn = document.getElementById('pair-btn');
  pairBtn?.addEventListener('click', handlePairClick);

  const monitorBtn = document.getElementById('monitor-btn');
  monitorBtn?.addEventListener('click', handleSetMonitorWindow);

  const pollingBtn = document.getElementById('polling-btn');
  pollingBtn?.addEventListener('click', handleTogglePolling);

  const manualPollBtn = document.getElementById('manual-poll-btn');
  manualPollBtn?.addEventListener('click', handleManualPoll);
});

/**
 * UIを更新
 */
async function updateUI(): Promise<void> {
  const storage = await chrome.storage.local.get([
    STORAGE_KEYS.deviceToken,
    STORAGE_KEYS.deviceName,
    STORAGE_KEYS.portalUrl,
    STORAGE_KEYS.monitorWindowId,
    STORAGE_KEYS.pollingEnabled,
  ]);

  const statusEl = document.getElementById('status');
  const deviceNameEl = document.getElementById('device-name');
  const portalUrlEl = document.getElementById('portal-url');
  const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;
  const monitorStatusEl = document.getElementById('monitor-status');
  const pollingBtn = document.getElementById('polling-btn') as HTMLButtonElement;

  const isPaired = !!storage[STORAGE_KEYS.deviceToken];
  const hasMonitorWindow = !!storage[STORAGE_KEYS.monitorWindowId];
  const pollingEnabled = !!storage[STORAGE_KEYS.pollingEnabled];

  if (statusEl) {
    statusEl.textContent = isPaired ? '接続済み' : '未接続';
    statusEl.className = `status ${isPaired ? 'connected' : 'disconnected'}`;
  }

  if (deviceNameEl) {
    deviceNameEl.textContent = storage[STORAGE_KEYS.deviceName] || '-';
  }

  if (portalUrlEl) {
    const url = storage[STORAGE_KEYS.portalUrl];
    portalUrlEl.textContent = url ? new URL(url).hostname : '-';
  }

  if (pairBtn) {
    pairBtn.textContent = isPaired ? 'ペアリング解除' : 'ペアリング設定';
  }

  if (monitorStatusEl) {
    monitorStatusEl.textContent = hasMonitorWindow ? '設定済み' : '未設定';
    monitorStatusEl.className = hasMonitorWindow ? 'monitor-set' : 'monitor-unset';
  }

  if (pollingBtn) {
    pollingBtn.textContent = pollingEnabled ? '自動監視: ON' : '自動監視: OFF';
    pollingBtn.className = pollingEnabled ? 'btn polling-on' : 'btn polling-off';
  }
}

/**
 * ペアリングボタンのクリックハンドラ
 */
async function handlePairClick(): Promise<void> {
  const storage = await chrome.storage.local.get(STORAGE_KEYS.deviceToken);
  const isPaired = !!storage[STORAGE_KEYS.deviceToken];

  if (isPaired) {
    // ペアリング解除
    await chrome.storage.local.remove([
      STORAGE_KEYS.deviceToken,
      STORAGE_KEYS.deviceName,
      STORAGE_KEYS.portalUrl,
    ]);
    await updateUI();
  } else {
    // ペアリング設定
    const code = prompt('ペアリングコード（6桁）を入力してください:');
    if (!code || code.length !== 6) {
      alert('無効なペアリングコードです');
      return;
    }

    const deviceName = prompt('このデバイスの名前を入力してください:', 'My Chrome');
    if (!deviceName) {
      return;
    }

    const portalUrl = prompt('ポータルURLを入力してください:', 'http://localhost:3000');
    if (!portalUrl) {
      return;
    }

    try {
      const response = await fetch(`${portalUrl}/api/extension/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairing_code: code,
          device_name: deviceName,
        }),
      });

      const result = await response.json();

      if (result.success && result.device_token) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.deviceToken]: result.device_token,
          [STORAGE_KEYS.deviceName]: deviceName,
          [STORAGE_KEYS.portalUrl]: portalUrl,
        });
        await updateUI();
        alert('ペアリングが完了しました');
      } else {
        alert(`ペアリングに失敗しました: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * 監視ウィンドウ設定ボタンのクリックハンドラ
 */
async function handleSetMonitorWindow(): Promise<void> {
  // 現在のウィンドウを監視用に設定
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.monitorWindowId]: tab.windowId,
    });
    await updateUI();
    alert('このウィンドウを監視用に設定しました。\nヘルスチェックはこのウィンドウで実行されます。');
  } else {
    alert('ウィンドウIDを取得できませんでした');
  }
}

/**
 * ポーリング切り替えボタンのクリックハンドラ
 */
async function handleTogglePolling(): Promise<void> {
  chrome.runtime.sendMessage({ type: 'TOGGLE_POLLING' }, async (response) => {
    if (response?.success) {
      await updateUI();
    }
  });
}

/**
 * 手動ポーリングボタンのクリックハンドラ
 */
async function handleManualPoll(): Promise<void> {
  const btn = document.getElementById('manual-poll-btn') as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '実行中...';
  }

  chrome.runtime.sendMessage({ type: 'MANUAL_POLL' }, async (response) => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '今すぐチェック';
    }
    if (response?.success) {
      alert('ジョブチェックを実行しました');
    } else {
      alert('ジョブチェックに失敗しました');
    }
  });
}
