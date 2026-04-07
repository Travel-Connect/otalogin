'use client';

import { useEffect, useState, useMemo } from 'react';

export interface MissingChannel {
  channel_id: string;
  channel_name: string;
  account_count: number;
}

interface Props {
  isOpen: boolean;
  channels: MissingChannel[];
  onConfirm: (selectedChannelIds: string[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function MissingChannelsDialog({
  isOpen,
  channels,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  // デフォルト全選択
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(channels.map((c) => c.channel_id))
  );

  // channels が変わったら選択状態を初期化
  useEffect(() => {
    setSelectedIds(new Set(channels.map((c) => c.channel_id)));
  }, [channels]);

  // Esc でキャンセル
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const allChecked = useMemo(
    () => channels.length > 0 && selectedIds.size === channels.length,
    [channels.length, selectedIds.size]
  );
  const noneChecked = selectedIds.size === 0;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(channels.map((c) => c.channel_id)));
    }
  };

  const handleConfirm = () => {
    if (noneChecked || loading) return;
    onConfirm(Array.from(selectedIds));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
        onClick={loading ? undefined : onCancel}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            マスタに無いOTAが見つかりました
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            以下のOTAはこの施設のDBにありますが、マスタPWシートには存在しません。
            マスタから意図的に削除した場合は「削除」を押してください。
          </p>

          {/* 全選択トグル */}
          <div className="border-b border-gray-200 pb-2 mb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                disabled={loading}
                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              全選択 / 全解除
            </label>
          </div>

          {/* チャネルリスト */}
          <div className="max-h-64 overflow-y-auto space-y-2 mb-6">
            {channels.map((ch) => (
              <label
                key={ch.channel_id}
                className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(ch.channel_id)}
                  onChange={() => toggle(ch.channel_id)}
                  disabled={loading}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  {ch.channel_name}
                  <span className="text-gray-500 ml-1">（{ch.account_count}件）</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn btn-secondary disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={noneChecked || loading}
              className="btn btn-danger disabled:opacity-50"
            >
              {loading ? '削除中...' : `選択したOTAを削除（${selectedIds.size}件）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
