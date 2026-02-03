'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusLamp } from '@/components/StatusLamp';
import { PasswordField } from '@/components/PasswordField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { FacilityDetailData, ChannelWithAccount } from '@/lib/supabase/types';

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
  facility: FacilityDetailData;
  isAdmin: boolean;
}

export function FacilityDetail({ facility, isAdmin }: Props) {
  const router = useRouter();
  const [activeChannel, setActiveChannel] = useState<string>(
    facility.channels[0]?.code || ''
  );
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncingChannel, setSyncingChannel] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);

  // 拡張機能の接続状態を確認
  const checkExtensionConnection = useCallback(async () => {
    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
    if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime) {
      setExtensionConnected(false);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      chrome.runtime.sendMessage(
        extensionId,
        { type: 'PING' },
        (res) => {
          const response = res as ExtensionResponse | undefined;
          if (chrome.runtime.lastError || !response?.success) {
            setExtensionConnected(false);
            resolve(false);
          } else {
            setExtensionConnected(true);
            resolve(true);
          }
        }
      );
      // タイムアウト
      setTimeout(() => {
        resolve(false);
      }, 2000);
    });
  }, []);

  // 初回マウント時に拡張接続を確認
  useEffect(() => {
    checkExtensionConnection();
  }, [checkExtensionConnection]);

  // 編集用フォームの状態
  const [formData, setFormData] = useState<{
    login_id: string;
    password: string;
    field_values: Record<string, string>;
  }>({ login_id: '', password: '', field_values: {} });

  const currentChannel = facility.channels.find(
    (ch) => ch.code === activeChannel
  );

  const handleEditStart = () => {
    if (!currentChannel) return;
    setFormData({
      login_id: currentChannel.account?.login_id || '',
      password: currentChannel.account?.password || '',
      field_values: currentChannel.account?.field_values.reduce((acc, fv) => {
        acc[fv.field_key] = fv.value;
        return acc;
      }, {} as Record<string, string>) || {},
    });
    setEditMode(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleEditCancel = () => {
    setEditMode(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!currentChannel) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/facility/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facility_id: facility.id,
          channel_id: currentChannel.id,
          account_type: 'shared',
          login_id: formData.login_id,
          password: formData.password,
          field_values: formData.field_values,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '保存に失敗しました');
      }

      setEditMode(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!currentChannel) return;
    setSyncingChannel(currentChannel.code);
    setSyncDialogOpen(false);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/master-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facility_id: facility.id,
          channel_id: currentChannel.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // エラーメッセージをユーザーフレンドリーに変換
        let errorMsg = data.error || '同期に失敗しました';
        if (data.error === 'No matching data found in master sheet') {
          errorMsg = 'マスタシートに該当するデータが見つかりません';
        }
        throw new Error(errorMsg);
      }

      router.refresh();
      setSuccessMessage(`${currentChannel.name}のアカウント情報を同期しました`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '同期に失敗しました');
    } finally {
      setSyncingChannel(null);
    }
  };

  const handleLogin = async () => {
    if (!currentChannel) return;
    setError(null);
    setSuccessMessage(null);
    setIsLoggingIn(true);

    try {
      // 拡張機能の接続を確認
      const isConnected = await checkExtensionConnection();
      if (!isConnected) {
        throw new Error('Chrome拡張が接続されていません。拡張機能をインストールしてページを再読み込みしてください。');
      }

      // アカウント情報が設定されているか確認
      if (!currentChannel.account) {
        throw new Error('アカウント情報が設定されていません。先にアカウントを設定してください。');
      }

      const response = await fetch('/api/extension/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facility_id: facility.id,
          channel_id: currentChannel.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ログイン実行に失敗しました');
      }

      const data = await response.json();

      // Chrome拡張にメッセージを送信
      const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
      if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          extensionId,
          {
            type: 'DISPATCH_LOGIN',
            payload: { job_id: data.job_id },
          },
          (res) => {
            const response = res as ExtensionResponse | undefined;
            if (chrome.runtime.lastError) {
              console.error('Extension error:', chrome.runtime.lastError);
              setError('Chrome拡張との通信に失敗しました');
              setIsLoggingIn(false);
            } else if (response?.success) {
              setSuccessMessage('ログイン処理を開始しました。新しいタブが開きます。');
              // 少し待ってからページを更新（結果を反映するため）
              setTimeout(() => {
                router.refresh();
                setIsLoggingIn(false);
              }, 3000);
            } else {
              setError(response?.error || 'ログイン実行に失敗しました');
              setIsLoggingIn(false);
            }
          }
        );
      } else {
        throw new Error('Chrome拡張が利用できません');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログイン実行に失敗しました');
      setIsLoggingIn(false);
    }
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
        {/* 拡張未接続警告 */}
        {extensionConnected === false && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Chrome拡張が接続されていません。ログイン機能を使用するには拡張機能をインストールしてください。</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">
            {successMessage}
          </div>
        )}

        {/* チャネルタブ */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-4">
            {facility.channels.map((channel) => (
              <button
                key={channel.code}
                onClick={() => {
                  setActiveChannel(channel.code);
                  setEditMode(false);
                  setError(null);
                  setSuccessMessage(null);
                }}
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
              <div>
                <div className="flex items-center gap-3">
                  <StatusLamp status={currentChannel.status} />
                  <h2 className="text-lg font-semibold">{currentChannel.name}</h2>
                </div>
                {/* 直近の実行結果 */}
                <div className="mt-2 text-sm text-gray-500">
                  {currentChannel.last_checked_at ? (
                    <span>
                      最終確認: {new Date(currentChannel.last_checked_at).toLocaleString('ja-JP')}
                      {currentChannel.status === 'unhealthy' && currentChannel.last_error_message && (
                        <span className="ml-2 text-red-500">
                          ({currentChannel.last_error_message})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>未確認</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {!editMode && isAdmin && (
                  <button
                    onClick={() => setSyncDialogOpen(true)}
                    disabled={syncingChannel === currentChannel.code}
                    className="btn btn-secondary text-sm disabled:opacity-50"
                  >
                    {syncingChannel === currentChannel.code
                      ? '同期中...'
                      : 'マスタPWと同期'}
                  </button>
                )}
                {!editMode && (
                  <button
                    onClick={handleLogin}
                    disabled={isLoggingIn || !currentChannel.account}
                    className="btn btn-primary text-sm disabled:opacity-50"
                  >
                    {isLoggingIn ? 'ログイン中...' : 'ログイン実行'}
                  </button>
                )}
              </div>
            </div>

            {editMode ? (
              <AccountEditForm
                channel={currentChannel}
                formData={formData}
                setFormData={setFormData}
                onSave={handleSave}
                onCancel={handleEditCancel}
                saving={saving}
              />
            ) : (
              <AccountDisplay
                channel={currentChannel}
                isAdmin={isAdmin}
                onEditClick={handleEditStart}
              />
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

// アカウント表示コンポーネント
function AccountDisplay({
  channel,
  isAdmin,
  onEditClick,
}: {
  channel: ChannelWithAccount;
  isAdmin: boolean;
  onEditClick: () => void;
}) {
  if (!channel.account) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>アカウント情報が設定されていません</p>
        {isAdmin && (
          <button onClick={onEditClick} className="btn btn-primary text-sm mt-4">
            アカウントを設定
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ログインID
        </label>
        <p className="text-gray-900">{channel.account.login_id}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          パスワード
        </label>
        <PasswordField
          value={channel.account.password}
          onReveal={async () => channel.account?.password || ''}
        />
      </div>

      {/* 追加フィールド */}
      {channel.field_definitions.map((def) => {
        const fieldValue = channel.account?.field_values.find(
          (fv) => fv.field_key === def.field_key
        );
        return (
          <div key={def.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {def.field_label}
              {def.is_required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {def.field_type === 'password' ? (
              <PasswordField
                value={fieldValue?.value || ''}
                onReveal={async () => fieldValue?.value || ''}
              />
            ) : (
              <p className="text-gray-900">{fieldValue?.value || '-'}</p>
            )}
          </div>
        );
      })}

      {isAdmin && (
        <div className="pt-4 border-t">
          <button onClick={onEditClick} className="btn btn-secondary text-sm">
            編集
          </button>
        </div>
      )}
    </div>
  );
}

// アカウント編集フォーム
function AccountEditForm({
  channel,
  formData,
  setFormData,
  onSave,
  onCancel,
  saving,
}: {
  channel: ChannelWithAccount;
  formData: {
    login_id: string;
    password: string;
    field_values: Record<string, string>;
  };
  setFormData: React.Dispatch<React.SetStateAction<typeof formData>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ログインID <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.login_id}
          onChange={(e) => setFormData({ ...formData, login_id: e.target.value })}
          className="input"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          パスワード <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="input"
          required
        />
      </div>

      {/* 追加フィールド */}
      {channel.field_definitions.map((def) => (
        <div key={def.id}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {def.field_label}
            {def.is_required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {def.field_type === 'select' && def.options ? (
            <select
              value={formData.field_values[def.field_key] || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  field_values: { ...formData.field_values, [def.field_key]: e.target.value },
                })
              }
              className="input"
              required={def.is_required}
            >
              <option value="">選択してください</option>
              {def.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={def.field_type === 'password' ? 'password' : 'text'}
              value={formData.field_values[def.field_key] || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  field_values: { ...formData.field_values, [def.field_key]: e.target.value },
                })
              }
              className="input"
              required={def.is_required}
            />
          )}
        </div>
      ))}

      <div className="pt-4 border-t flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !formData.login_id || !formData.password}
          className="btn btn-primary text-sm disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary text-sm disabled:opacity-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
