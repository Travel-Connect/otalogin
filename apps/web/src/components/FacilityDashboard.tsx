'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FacilityCard } from './FacilityCard';
import { Filters, type StatusFilter } from './Filters';
import type { DashboardFacility, DashboardChannelStatus } from '@/lib/supabase/types';

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

// --- SortableFacilityCard wrapper ---
function SortableFacilityCard({
  facility,
  onChannelLogin,
  reorderMode,
}: {
  facility: DashboardFacility;
  onChannelLogin: (facilityId: string, channelId: string, channelCode: string) => void;
  reorderMode: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: facility.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={reorderMode ? 'animate-wiggle' : ''}>
      {reorderMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 w-8 h-8 bg-white/90 border border-gray-300 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
      )}
      <FacilityCard facility={facility} onChannelLogin={onChannelLogin} />
    </div>
  );
}

// --- Main Dashboard ---
interface FacilityDashboardProps {
  facilities: DashboardFacility[];
  isAdmin?: boolean;
}

export function FacilityDashboard({ facilities, isAdmin = false }: FacilityDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const tagParam = searchParams.get('tag');
    return tagParam ? tagParam.split(',').filter(Boolean) : [];
  });
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilter[]>(() => {
    const statusParam = searchParams.get('status');
    return statusParam ? statusParam.split(',').filter((s): s is StatusFilter => ['error', 'running', 'unregistered'].includes(s)) : [];
  });
  const [loginMessage, setLoginMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // フィルター状態をURLクエリパラメータに同期
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTags.length > 0) params.set('tag', selectedTags.join(','));
    if (selectedStatuses.length > 0) params.set('status', selectedStatuses.join(','));
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }, [selectedTags, selectedStatuses, router]);

  // 並べ替えモード
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => facilities.map(f => f.id));
  const [saving, setSaving] = useState(false);

  // DnD sensors — require 8px movement before drag starts (prevents accidental drags)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // 施設作成ダイアログ
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', code: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Gather all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    facilities.forEach((f) => f.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [facilities]);

  // Filter facilities
  const filteredFacilities = useMemo(() => {
    return facilities.filter((facility) => {
      if (search && !facility.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (selectedTags.length > 0) {
        const hasTag = selectedTags.some((tag) => facility.tags.includes(tag));
        if (!hasTag) return false;
      }
      if (selectedStatuses.length > 0) {
        const statuses = new Set<DashboardChannelStatus>(
          facility.channels.map((ch) => ch.status),
        );
        const match = selectedStatuses.some((sf) => {
          if (sf === 'error') return statuses.has('error');
          if (sf === 'running') return statuses.has('running');
          if (sf === 'unregistered') return statuses.has('unregistered');
          return false;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [facilities, search, selectedTags, selectedStatuses]);

  // Apply user ordering to filtered facilities
  const orderedFacilities = useMemo(() => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    return [...filteredFacilities].sort((a, b) => {
      const posA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const posB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });
  }, [filteredFacilities, orderedIds]);

  // DnD drag end handler
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      next.splice(oldIndex, 1);
      next.splice(newIndex, 0, active.id as string);
      return next;
    });
  }, []);

  // Save order to API
  const handleSaveOrder = useCallback(async () => {
    setSaving(true);
    try {
      const orders = orderedIds.map((id, i) => ({ facility_id: id, position: i }));
      const res = await fetch('/api/user-facility-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      setReorderMode(false);
      setLoginMessage({ type: 'success', text: '並び順を保存しました' });
      setTimeout(() => setLoginMessage(null), 3000);
    } catch {
      setLoginMessage({ type: 'error', text: '並び順の保存に失敗しました' });
      setTimeout(() => setLoginMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [orderedIds]);

  // Check extension connection
  const checkExtensionConnection = useCallback(async () => {
    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
    if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime) {
      return false;
    }
    return new Promise<boolean>((resolve) => {
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
  }, []);

  // Handle login from dashboard
  const handleChannelLogin = useCallback(async (facilityId: string, channelId: string, _channelCode: string) => {
    setLoginMessage(null);

    try {
      // 先にPINGで接続確認（孤立ジョブ防止: 接続失敗時にジョブを作らない）
      const isConnected = await checkExtensionConnection();
      if (!isConnected) {
        throw new Error('Chrome拡張が接続されていません');
      }

      const response = await fetch('/api/extension/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility_id: facilityId, channel_id: channelId }),
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
            const extResponse = res as ExtensionResponse | undefined;
            if (chrome.runtime.lastError || !extResponse?.success) {
              setLoginMessage({
                type: 'error',
                text: `拡張への通知に失敗: ${chrome.runtime.lastError?.message || extResponse?.error || '不明なエラー'}`,
              });
            }
          }
        );
      }

      setLoginMessage({ type: 'success', text: 'ログインジョブを開始しました' });
      setTimeout(() => setLoginMessage(null), 3000);
    } catch (err) {
      setLoginMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'ログインに失敗しました',
      });
      setTimeout(() => setLoginMessage(null), 5000);
    }
  }, [checkExtensionConnection]);

  // Handle facility creation
  const handleCreateFacility = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch('/api/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          code: createForm.code,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '施設の作成に失敗しました');
      }

      const data = await response.json();
      setCreateDialogOpen(false);
      setCreateForm({ name: '', code: '' });
      // 新しい施設の設定ページへ遷移
      router.push(`/facility/${data.facility.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '施設の作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* Search + Filter bar */}
      <div className="max-w-[1440px] mx-auto px-6 py-2.5 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="施設名で検索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
          />
        </div>

        <div className="h-5 w-px bg-gray-200" />

        <Filters
          allTags={allTags}
          selectedTags={selectedTags}
          selectedStatuses={selectedStatuses}
          onTagsChange={setSelectedTags}
          onStatusesChange={setSelectedStatuses}
          onClear={() => { setSelectedTags([]); setSelectedStatuses([]); }}
        />

        {/* Add facility button (admin only) */}
        {isAdmin && (
          <>
            <div className="h-5 w-px bg-gray-200" />
            <button
              onClick={() => {
                setCreateForm({ name: '', code: '' });
                setCreateError(null);
                setCreateDialogOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              施設追加
            </button>
          </>
        )}

        {/* Reorder button */}
        <div className="h-5 w-px bg-gray-200" />
        {reorderMode ? (
          <button
            onClick={handleSaveOrder}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '完了'}
          </button>
        ) : (
          <button
            onClick={() => setReorderMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              <polyline points="7 3 3 6 7 9" /><polyline points="17 15 21 18 17 21" />
            </svg>
            並べ替え
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filteredFacilities.length} / {facilities.length} 件
        </span>
      </div>

      {/* Toast message */}
      {loginMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          loginMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {loginMessage.text}
        </div>
      )}

      {/* Card grid */}
      <main className="max-w-[1440px] mx-auto px-6 py-6">
        {orderedFacilities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-30">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <p className="text-base">条件に一致する施設が見つかりません</p>
            <button
              onClick={() => { setSearch(''); setSelectedTags([]); setSelectedStatuses([]); }}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
            >
              フィルタをクリア
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedFacilities.map(f => f.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {orderedFacilities.map((facility) => (
                  <SortableFacilityCard
                    key={facility.id}
                    facility={facility}
                    onChannelLogin={handleChannelLogin}
                    reorderMode={reorderMode}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>

      {/* 施設作成ダイアログ */}
      {createDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
            onClick={() => !creating && setCreateDialogOpen(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">施設を追加</h3>

              {createError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    施設名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                    placeholder="例: スターハウス今帰仁"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    施設コード <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createForm.code}
                    onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                    placeholder="例: starhouse-nakijin（スプレッドシートの施設IDと一致させる）"
                  />
                  <p className="mt-1 text-xs text-gray-400">マスタPWシートのA列（施設ID）と一致させてください</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={creating}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCreateFacility}
                  disabled={creating || !createForm.name.trim() || !createForm.code.trim()}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {creating ? '作成中...' : '作成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
