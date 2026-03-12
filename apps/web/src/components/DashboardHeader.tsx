'use client';

import Link from 'next/link';
import { useState } from 'react';

const EXTENSION_URL = 'chrome://extensions/?id=hjpgbfenjlcebohnfnkahenaglpdgmhb';
const MASTER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Gu3kQ-akBLRiRVsrxim3-cH3crg_e0rLN12ABTpZHA0/edit?gid=0#gid=0';

interface DashboardHeaderProps {
  isDevelopmentMode: boolean;
}

export function DashboardHeader({ isDevelopmentMode }: DashboardHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleExtensionLink = async () => {
    await navigator.clipboard.writeText(EXTENSION_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center gap-4">
        {/* Logo / App name */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 whitespace-nowrap">OTAログインポータル</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isDevelopmentMode && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              開発モード
            </span>
          )}
          <a
            href={MASTER_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            マスターシート
          </a>
          <button
            onClick={handleExtensionLink}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
            title="URLをコピーしてアドレスバーに貼り付けてください"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            {copied ? 'URLコピー済み!' : '拡張機能の更新'}
          </button>
          <Link
            href="/settings/channel-logos"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
          >
            ロゴ設定
          </Link>
          <Link
            href="/shortcuts"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
          >
            ショートカット
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
