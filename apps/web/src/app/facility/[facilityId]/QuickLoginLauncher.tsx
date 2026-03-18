'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface ExtensionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

interface Props {
  facilityId: string;
  facilityName: string;
  channelName: string;
  channelCode: string;
  jobId: string;
}

/**
 * ディープリンク run=1 用の軽量ランチャー
 * 施設詳細ページの全レンダリングをスキップし、
 * ジョブ作成済みの状態で拡張に即座にDISPATCH_LOGINを送信する
 */
export function QuickLoginLauncher({ facilityId, facilityName, channelName, channelCode, jobId }: Props) {
  const dispatched = useRef(false);
  const [status, setStatus] = useState<'dispatching' | 'success' | 'error'>('dispatching');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (dispatched.current) return;
    dispatched.current = true;

    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
    if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime) {
      setStatus('error');
      setErrorMessage('Chrome拡張が接続されていません');
      return;
    }

    chrome.runtime.sendMessage(
      extensionId,
      {
        type: 'DISPATCH_LOGIN',
        payload: { job_id: jobId },
      },
      (res) => {
        const response = res as ExtensionResponse | undefined;
        if (chrome.runtime.lastError || !response?.success) {
          setStatus('error');
          setErrorMessage(
            chrome.runtime.lastError?.message || response?.error || 'Chrome拡張との通信に失敗しました'
          );
        } else {
          setStatus('success');
        }
      }
    );
  }, [jobId]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
        <h2 className="text-lg font-bold text-gray-800 mb-2">{facilityName}</h2>
        <p className="text-gray-500 mb-6">{channelName}</p>

        {status === 'dispatching' && (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
            <p className="text-blue-600 font-medium">ログイン処理を開始しています...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-600 font-medium">ログイン処理を開始しました</p>
            <p className="text-sm text-gray-500">新しいタブが開きます</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-600 font-medium">{errorMessage}</p>
          </div>
        )}

        <div className="mt-8 flex gap-3 justify-center">
          <Link
            href={`/facility/${facilityId}?channel=${channelCode}`}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            施設詳細を開く
          </Link>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
