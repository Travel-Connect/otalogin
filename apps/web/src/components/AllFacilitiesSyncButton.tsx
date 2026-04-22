'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from './ConfirmDialog';

interface AllFacilitiesSyncButtonProps {
  facilities: { id: string; name: string }[];
}

type SyncProgress =
  | { kind: 'idle' }
  | { kind: 'running'; current: number; total: number; name: string }
  | { kind: 'done'; success: number; failed: number; failures: { name: string; error: string }[] };

export function AllFacilitiesSyncButton({ facilities }: AllFacilitiesSyncButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({ kind: 'idle' });

  const isRunning = progress.kind === 'running';

  const handleSyncAll = async () => {
    setDialogOpen(false);
    const total = facilities.length;
    const failures: { name: string; error: string }[] = [];
    let success = 0;

    for (let i = 0; i < facilities.length; i++) {
      const f = facilities[i];
      setProgress({ kind: 'running', current: i + 1, total, name: f.name });
      try {
        const res = await fetch('/api/master-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facility_id: f.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          failures.push({ name: f.name, error: data.error || `HTTP ${res.status}` });
        } else {
          success++;
        }
      } catch (err) {
        failures.push({ name: f.name, error: err instanceof Error ? err.message : 'ネットワークエラー' });
      }
    }

    setProgress({ kind: 'done', success, failed: failures.length, failures });
    router.refresh();
    // 成功のみのときは5秒で自動クローズ
    if (failures.length === 0) {
      setTimeout(() => setProgress({ kind: 'idle' }), 5000);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={isRunning || facilities.length === 0}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl transition-colors"
        title="全施設を一括同期"
      >
        {isRunning ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        )}
        {isRunning ? `${progress.current}/${progress.total} 同期中…` : '全施設を同期'}
      </button>

      <ConfirmDialog
        isOpen={dialogOpen}
        title="全施設を一括同期"
        message={`${facilities.length}施設の全チャネルをマスタPWシートから一括同期します。時間がかかります。既存の設定は上書きされます。`}
        confirmLabel="実行する"
        onConfirm={handleSyncAll}
        onCancel={() => setDialogOpen(false)}
      />

      {/* 進捗トースト */}
      {progress.kind === 'running' && (
        <div className="fixed top-16 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-white border border-indigo-200">
          <div className="flex items-center gap-2">
            <svg className="animate-spin text-indigo-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            <span className="text-gray-700">
              {progress.current}/{progress.total} 同期中: <span className="font-semibold">{progress.name}</span>
            </span>
          </div>
        </div>
      )}

      {/* 完了トースト */}
      {progress.kind === 'done' && (
        <div className="fixed top-16 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm max-w-md bg-white border border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-gray-800">
                同期完了: 成功 <span className="text-green-600">{progress.success}</span> / 失敗 <span className={progress.failed > 0 ? 'text-red-600' : 'text-gray-500'}>{progress.failed}</span>
              </p>
              {progress.failures.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-600 max-h-32 overflow-y-auto">
                  {progress.failures.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.name}</span>: <span className="text-red-600">{f.error}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setProgress({ kind: 'idle' })}
              className="text-gray-400 hover:text-gray-600"
              aria-label="閉じる"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
