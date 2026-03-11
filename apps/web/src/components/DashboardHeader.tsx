'use client';

import Link from 'next/link';

interface DashboardHeaderProps {
  isDevelopmentMode: boolean;
}

export function DashboardHeader({ isDevelopmentMode }: DashboardHeaderProps) {
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
