'use client';

import { useEffect, useRef, useState } from 'react';

// Chrome拡張の型定義
declare global {
  interface Window {
    chrome?: typeof chrome;
  }
}

interface ExtensionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

interface Props {
  facilityId: string;
  facilityName: string;
  channelId: string;
  channelName: string;
  /** autoRun 失敗時に通常UIにフォールバックするURL */
  fallbackUrl: string;
}

/**
 * ディープリンク run=1 用の軽量ログインディスパッチャー
 * - PING → dispatch API → DISPATCH_LOGIN → タブを閉じる/リダイレクト
 * - 全データフェッチ不要、最小限のJSで高速実行
 */
export function AutoLoginDispatcher({ facilityId, channelId, channelName, fallbackUrl }: Props) {
  const dispatched = useRef(false);
  const [status, setStatus] = useState<'connecting' | 'dispatching' | 'done' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (dispatched.current) return;
    dispatched.current = true;

    (async () => {
      try {
        const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
        if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime) {
          throw new Error('Chrome拡張が利用できません');
        }

        // 1. PING で拡張接続確認
        const connected = await new Promise<boolean>((resolve) => {
          chrome.runtime.sendMessage(
            extensionId,
            { type: 'PING' },
            (res) => {
              const response = res as ExtensionResponse | undefined;
              if (chrome.runtime.lastError || !response?.success) {
                resolve(false);
              } else {
                resolve(true);
              }
            }
          );
          setTimeout(() => resolve(false), 2000);
        });

        if (!connected) {
          throw new Error('Chrome拡張が接続されていません');
        }

        // 2. ジョブ作成
        setStatus('dispatching');
        const response = await fetch('/api/extension/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facility_id: facilityId, channel_id: channelId }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'ジョブ作成に失敗しました');
        }

        const data = await response.json();

        // 3. 拡張にディスパッチ
        await new Promise<void>((resolve, reject) => {
          chrome.runtime.sendMessage(
            extensionId,
            {
              type: 'DISPATCH_LOGIN',
              payload: { job_id: data.job_id },
            },
            (res) => {
              const extResponse = res as ExtensionResponse | undefined;
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || '拡張との通信に失敗'));
              } else if (!extResponse?.success) {
                reject(new Error(extResponse?.error || 'ディスパッチに失敗'));
              } else {
                resolve();
              }
            }
          );
        });

        // 4. 成功 → タブを閉じるか、ダッシュボードにリダイレクト
        setStatus('done');

        // window.close() はスクリプトが開いたタブでのみ動作
        // キーボードショートカット経由の場合は閉じられないので、リダイレクトにフォールバック
        window.close();
        // window.close() が効かなかった場合（200ms後にまだ生きていたら）
        setTimeout(() => {
          window.location.href = '/';
        }, 200);

      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'ログイン実行に失敗しました');
      }
    })();
  }, [facilityId, channelId]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-red-600 font-medium mb-2">{errorMessage}</p>
          <a
            href={fallbackUrl}
            className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            施設ページで手動ログイン
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-10 h-10 mx-auto mb-4 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-gray-700 font-medium">
          {status === 'connecting' && '拡張機能に接続中...'}
          {status === 'dispatching' && `${channelName} にログイン中...`}
          {status === 'done' && 'ログインを開始しました'}
        </p>
      </div>
    </div>
  );
}
