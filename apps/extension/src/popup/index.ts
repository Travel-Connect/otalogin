/**
 * Popup Script
 * 拡張のポップアップUIを制御
 */

const STORAGE_KEYS = {
  deviceToken: 'device_token',
  deviceName: 'device_name',
  portalUrl: 'portal_url',
};

/**
 * 初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
  await updateUI();

  const pairBtn = document.getElementById('pair-btn');
  pairBtn?.addEventListener('click', handlePairClick);
});

/**
 * UIを更新
 */
async function updateUI(): Promise<void> {
  const storage = await chrome.storage.local.get([
    STORAGE_KEYS.deviceToken,
    STORAGE_KEYS.deviceName,
    STORAGE_KEYS.portalUrl,
  ]);

  const statusEl = document.getElementById('status');
  const deviceNameEl = document.getElementById('device-name');
  const portalUrlEl = document.getElementById('portal-url');
  const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;

  const isPaired = !!storage[STORAGE_KEYS.deviceToken];

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
