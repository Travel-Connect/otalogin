'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatusLamp } from '@/components/StatusLamp';
import { PasswordField } from '@/components/PasswordField';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface ChannelInfo {
  id: string;
  code: string;
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  account: {
    login_id: string;
    has_password: boolean;
  } | null;
}

interface FacilityInfo {
  id: string;
  code: string;
  name: string;
  channels: ChannelInfo[];
}

interface Props {
  facility: FacilityInfo;
}

export function FacilityDetail({ facility }: Props) {
  const [activeChannel, setActiveChannel] = useState<string>(
    facility.channels[0]?.code || ''
  );
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncingChannel, setSyncingChannel] = useState<string | null>(null);

  const currentChannel = facility.channels.find(
    (ch) => ch.code === activeChannel
  );

  const handleSync = async () => {
    if (!currentChannel) return;
    setSyncingChannel(currentChannel.code);
    setSyncDialogOpen(false);

    // TODO: 同期API呼び出し
    // await fetch('/api/master-sync', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     facility_id: facility.id,
    //     channel_id: currentChannel.id,
    //   }),
    // });

    // ダミー処理
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSyncingChannel(null);
  };

  const handleLogin = async () => {
    if (!currentChannel) return;

    // TODO: ログイン実行API呼び出し
    // const response = await fetch('/api/extension/dispatch', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     facility_id: facility.id,
    //     channel_id: currentChannel.id,
    //   }),
    // });
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{facility.name}</h1>
              <p className="text-sm text-gray-500">{facility.code}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* チャネルタブ */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-4">
            {facility.channels.map((channel) => (
              <button
                key={channel.code}
                onClick={() => setActiveChannel(channel.code)}
                className={`pb-4 px-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeChannel === channel.code
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <StatusLamp status={channel.status} size="sm" />
                {channel.name}
              </button>
            ))}
          </nav>
        </div>

        {/* チャネル詳細 */}
        {currentChannel && (
          <div className="card">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <StatusLamp status={currentChannel.status} />
                <h2 className="text-lg font-semibold">{currentChannel.name}</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSyncDialogOpen(true)}
                  disabled={syncingChannel === currentChannel.code}
                  className="btn btn-secondary text-sm disabled:opacity-50"
                >
                  {syncingChannel === currentChannel.code
                    ? '同期中...'
                    : 'マスタPWと同期'}
                </button>
                <button onClick={handleLogin} className="btn btn-primary text-sm">
                  ログイン実行
                </button>
              </div>
            </div>

            {currentChannel.account ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ログインID
                  </label>
                  <p className="text-gray-900">{currentChannel.account.login_id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    パスワード
                  </label>
                  <PasswordField
                    value=""
                    onReveal={async () => {
                      // TODO: API経由でパスワードを取得
                      return 'dummy_password';
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>アカウント情報が設定されていません</p>
                <button className="btn btn-primary text-sm mt-4">
                  アカウントを設定
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 同期確認ダイアログ */}
      <ConfirmDialog
        isOpen={syncDialogOpen}
        title="マスタPWと同期"
        message={`${currentChannel?.name}のアカウント情報を共通マスタPWシートと同期します。既存の設定は上書きされます。`}
        confirmLabel="同期する"
        cancelLabel="キャンセル"
        onConfirm={handleSync}
        onCancel={() => setSyncDialogOpen(false)}
      />
    </div>
  );
}
