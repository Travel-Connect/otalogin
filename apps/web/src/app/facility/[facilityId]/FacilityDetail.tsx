'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusLamp } from '@/components/StatusLamp';
import { PasswordField } from '@/components/PasswordField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { FacilityDetailData, ChannelWithAccount, AccountData } from '@/lib/supabase/types';
import { buildFullUrl } from '@otalogin/shared';

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
  /** ディープリンクで指定されたチャネルコード（解決済み） */
  initialChannel?: string;
  /** ディープリンクで run=1 が指定された場合 true */
  autoRun?: boolean;
  /** ディープリンクで open=public が指定された場合 true */
  openPublic?: boolean;
}

export function FacilityDetail({ facility, isAdmin, initialChannel, autoRun, openPublic }: Props) {
  const router = useRouter();
  // ディープリンク指定があればそのチャネルを初期選択
  const resolvedInitialChannel = initialChannel && facility.channels.some(ch => ch.code === initialChannel)
    ? initialChannel
    : facility.channels[0]?.code || '';
  const [activeChannel, setActiveChannel] = useState<string>(resolvedInitialChannel);
  const channelDetailRef = useRef<HTMLDivElement>(null);
  const autoRunTriggered = useRef(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncingChannel, setSyncingChannel] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);

  // 施設情報編集用の状態
  const [facilityEditMode, setFacilityEditMode] = useState(false);
  const [facilityForm, setFacilityForm] = useState({ name: facility.name, code: facility.code });
  const [facilitySaving, setFacilitySaving] = useState(false);

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

  // ディープリンク: チャネル詳細エリアにスクロール
  useEffect(() => {
    if (initialChannel && channelDetailRef.current) {
      channelDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [initialChannel]);

  // ディープリンク: run=1 の場合に自動ログイン実行
  useEffect(() => {
    if (!autoRun || autoRunTriggered.current) return;
    if (extensionConnected === null) return; // 接続チェック中は待機
    autoRunTriggered.current = true;
    // 少し遅延させてUIが描画された後に実行
    const timer = setTimeout(() => {
      handleLogin();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoRun, extensionConnected]); // handleLogin is intentionally omitted to run only once

  // ディープリンク: open=public の場合に公開ページURLを開く
  const openPublicTriggered = useRef(false);
  useEffect(() => {
    if (!openPublic || openPublicTriggered.current) return;
    openPublicTriggered.current = true;
    const ch = facility.channels.find(c => c.code === initialChannel);
    if (!ch) return;
    const query = ch.account?.public_url_query;
    const fullUrl = buildFullUrl(ch.login_url, query ?? null);
    window.open(fullUrl, '_blank');
  }, [openPublic, initialChannel, facility.channels]);

  // 施設情報を保存
  const handleFacilitySave = async () => {
    setFacilitySaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/facility/${facility.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: facilityForm.name,
          code: facilityForm.code,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '保存に失敗しました');
      }

      setFacilityEditMode(false);
      setSuccessMessage('施設情報を更新しました');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setFacilitySaving(false);
    }
  };

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
        // 詳細があれば追加
        if (data.details) {
          errorMsg += ` (${data.details})`;
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
      // アカウント情報が設定されているか確認
      if (!currentChannel.account) {
        throw new Error('アカウント情報が設定されていません。先にアカウントを設定してください。');
      }

      // 拡張接続確認とジョブ作成を並列実行
      const [isConnected, response] = await Promise.all([
        checkExtensionConnection(),
        fetch('/api/extension/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facility_id: facility.id,
            channel_id: currentChannel.id,
          }),
        }),
      ]);

      if (!isConnected) {
        throw new Error('Chrome拡張が接続されていません。拡張機能をインストールしてページを再読み込みしてください。');
      }

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
            {facilityEditMode ? (
              <div className="flex items-center gap-3 flex-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 w-16">施設名</label>
                    <input
                      type="text"
                      value={facilityForm.name}
                      onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                      className="input text-sm py-1 px-2"
                      placeholder="施設名"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 w-16">施設コード</label>
                    <input
                      type="text"
                      value={facilityForm.code}
                      onChange={(e) => setFacilityForm({ ...facilityForm, code: e.target.value })}
                      className="input text-sm py-1 px-2"
                      placeholder="施設コード（スプレッドシートの施設IDと一致させてください）"
                    />
                  </div>
                </div>
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={handleFacilitySave}
                    disabled={facilitySaving || !facilityForm.name || !facilityForm.code}
                    className="btn btn-primary text-xs py-1 px-3 disabled:opacity-50"
                  >
                    {facilitySaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => {
                      setFacilityEditMode(false);
                      setFacilityForm({ name: facility.name, code: facility.code });
                    }}
                    disabled={facilitySaving}
                    className="btn btn-secondary text-xs py-1 px-3 disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{facility.name}</h1>
                  <p className="text-sm text-gray-500">{facility.code}</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setFacilityForm({ name: facility.name, code: facility.code });
                      setFacilityEditMode(true);
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="施設情報を編集"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
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
          <div ref={channelDetailRef} className={`card${initialChannel === activeChannel ? ' ring-2 ring-primary-500 ring-offset-2' : ''}`}>
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
                      {currentChannel.status === 'unhealthy' && (
                        <>
                          {currentChannel.last_error_code && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-mono">
                              {currentChannel.last_error_code}
                            </span>
                          )}
                          {currentChannel.last_error_message && (
                            <span className="ml-2 text-red-500">
                              {currentChannel.last_error_message}
                            </span>
                          )}
                        </>
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

        {/* ディープリンクURL一覧 */}
        <DeepLinkUrls facility={facility} />
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

// URLクエリ表示・編集コンポーネント
function UrlQuerySection({
  account,
  channel,
  isAdmin,
}: {
  account: AccountData;
  channel: ChannelWithAccount;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editingKind, setEditingKind] = useState<'public' | 'admin' | null>(null);
  const [queryForm, setQueryForm] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const startEdit = (kind: 'public' | 'admin') => {
    const query = kind === 'public' ? account.public_url_query : account.admin_url_query;
    setQueryForm(
      query
        ? Object.entries(query).map(([key, value]) => ({ key, value }))
        : [{ key: '', value: '' }]
    );
    setEditingKind(kind);
    setError(null);
    setSuccess(null);
  };

  const handleSaveQuery = async () => {
    if (!editingKind) return;
    setSaving(true);
    setError(null);

    const filtered = queryForm.filter((p) => p.key.trim() !== '');
    const query = filtered.length > 0
      ? Object.fromEntries(filtered.map((p) => [p.key.trim(), p.value]))
      : null;

    try {
      const res = await fetch('/api/facility/account/url-query', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: account.id,
          kind: editingKind,
          query,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存に失敗しました');
      }
      setEditingKind(null);
      setSuccess(`${editingKind === 'public' ? '公開' : '管理'}URLクエリを保存しました`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (kind: 'public' | 'admin') => {
    setSyncing(true);
    setError(null);
    setSuccess(null);

    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
    if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime) {
      setError('Chrome拡張が接続されていません');
      setSyncing(false);
      return;
    }

    // login_url からドメインを抽出
    const loginDomain = (() => {
      try { return new URL(channel.login_url).hostname; } catch { return ''; }
    })();
    if (!loginDomain) {
      setError('チャネルのログインURLが無効です');
      setSyncing(false);
      return;
    }

    chrome.runtime.sendMessage(
      extensionId,
      {
        type: 'SYNC_URL_QUERY',
        payload: { kind, allowed_domains: [loginDomain] },
      },
      async (rawRes) => {
        const res = rawRes as ExtensionResponse | undefined;
        if (chrome.runtime.lastError || !res?.success) {
          setError(res?.error || 'URLクエリの取得に失敗しました');
          setSyncing(false);
          return;
        }

        const query = res.data as Record<string, string> | null;

        try {
          const apiRes = await fetch('/api/facility/account/url-query', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_id: account.id,
              kind,
              query,
            }),
          });
          if (!apiRes.ok) {
            const data = await apiRes.json();
            throw new Error(data.error || '保存に失敗しました');
          }
          setSuccess(`アクティブタブから${kind === 'public' ? '公開' : '管理'}URLクエリを同期しました`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : '保存に失敗しました');
        } finally {
          setSyncing(false);
        }
      }
    );
  };

  const renderQueryDisplay = (kind: 'public' | 'admin', label: string) => {
    const query = kind === 'public' ? account.public_url_query : account.admin_url_query;
    const fullUrl = buildFullUrl(channel.login_url, query);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">{label}</label>
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => handleSync(kind)}
                disabled={syncing}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                title="アクティブタブのURLクエリを取得"
              >
                {syncing ? '同期中...' : 'タブから同期'}
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => startEdit(kind)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                編集
              </button>
            </div>
          )}
        </div>
        {query && Object.keys(query).length > 0 ? (
          <div className="bg-gray-50 rounded p-2 text-sm">
            <div className="flex flex-wrap gap-1 mb-1">
              {Object.entries(query).map(([k, v]) => (
                <span key={k} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">
                  {k}={v}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 break-all mt-1">{fullUrl}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">未設定</p>
        )}
      </div>
    );
  };

  if (editingKind) {
    return (
      <div className="border-t pt-4 mt-4 space-y-3">
        <h4 className="text-sm font-medium text-gray-700">
          {editingKind === 'public' ? '公開ページ' : '管理画面'} URLクエリ編集
        </h4>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {queryForm.map((param, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="キー"
              value={param.key}
              onChange={(e) => {
                const updated = [...queryForm];
                updated[i] = { ...updated[i], key: e.target.value };
                setQueryForm(updated);
              }}
              className="input text-sm py-1 px-2 w-1/3"
            />
            <span className="text-gray-400">=</span>
            <input
              type="text"
              placeholder="値"
              value={param.value}
              onChange={(e) => {
                const updated = [...queryForm];
                updated[i] = { ...updated[i], value: e.target.value };
                setQueryForm(updated);
              }}
              className="input text-sm py-1 px-2 flex-1"
            />
            <button
              onClick={() => setQueryForm(queryForm.filter((_, j) => j !== i))}
              className="text-red-400 hover:text-red-600 text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setQueryForm([...queryForm, { key: '', value: '' }])}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + パラメータ追加
        </button>
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSaveQuery}
            disabled={saving}
            className="btn btn-primary text-xs py-1 px-3 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={() => setEditingKind(null)}
            disabled={saving}
            className="btn btn-secondary text-xs py-1 px-3 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-4 mt-4 space-y-3">
      <h4 className="text-sm font-medium text-gray-700">URLクエリパラメータ</h4>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
      {renderQueryDisplay('public', '公開ページ')}
      {renderQueryDisplay('admin', '管理画面')}
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

      {/* URLクエリパラメータ */}
      {channel.account && (
        <UrlQuerySection account={channel.account} channel={channel} isAdmin={isAdmin} />
      )}

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

// ディープリンクURL一覧コンポーネント
function DeepLinkUrls({ facility }: { facility: FacilityDetailData }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const channelsWithAccount = facility.channels.filter((ch) => ch.account);

  if (channelsWithAccount.length === 0) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopy = async (url: string, code: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleCopyAll = async () => {
    const lines = channelsWithAccount.map(
      (ch) => `${ch.name}\t${baseUrl}/facility/${facility.id}?channel=${ch.code}&run=1`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setCopiedCode('__all__');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        StreamDeck / ディープリンクURL ({channelsWithAccount.length}件)
      </button>

      {isOpen && (
        <div className="mt-3 card">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-gray-500">アカウント設定済みチャネルのディープリンクURL</p>
            <button
              onClick={handleCopyAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {copiedCode === '__all__' ? 'コピー済み!' : '全URLをコピー (TSV)'}
            </button>
          </div>
          <div className="space-y-2">
            {channelsWithAccount.map((ch) => {
              const url = `${baseUrl}/facility/${facility.id}?channel=${ch.code}&run=1`;
              return (
                <div key={ch.code} className="flex items-center gap-2 group">
                  <StatusLamp status={ch.status} size="sm" />
                  <span className="text-sm font-medium text-gray-700 w-24 shrink-0">{ch.name}</span>
                  <code className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded flex-1 truncate">{url}</code>
                  <button
                    onClick={() => handleCopy(url, ch.code)}
                    className="shrink-0 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    {copiedCode === ch.code ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
