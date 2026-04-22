'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface FacilityMenuProps {
  facilityId: string;
  facilityName?: string;
  credentialSheetUrl?: string | null;
  isAdmin?: boolean;
  onMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export function FacilityMenu({
  facilityId,
  facilityName,
  credentialSheetUrl,
  isAdmin = false,
  onMessage,
}: FacilityMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setSyncing(true);
    try {
      const res = await fetch('/api/master-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility_id: facilityId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `同期に失敗しました (HTTP ${res.status})`;
        onMessage?.({ type: 'error', text: `${facilityName ? facilityName + ': ' : ''}${msg}` });
        return;
      }
      const data = await res.json();
      onMessage?.({
        type: 'success',
        text: `${facilityName ? facilityName + ': ' : ''}${data.message || '同期が完了しました'}`,
      });
      router.refresh();
    } catch (err) {
      onMessage?.({
        type: 'error',
        text: err instanceof Error ? err.message : '同期に失敗しました',
      });
    } finally {
      setSyncing(false);
    }
  };

  const hasCredentialSheet = !!credentialSheetUrl;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        disabled={syncing}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        aria-label="施設メニュー"
      >
        {syncing ? (
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 rounded-xl shadow-lg bg-white border border-gray-200 z-30 py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/facility/${facilityId}`);
              setIsOpen(false);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            施設設定
          </button>
          {isAdmin && (
            <button
              onClick={handleSync}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              マスタPWと同期
            </button>
          )}
          {hasCredentialSheet ? (
            <a
              href={credentialSheetUrl!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ID/PW表を開く
            </a>
          ) : (
            <span
              className="block w-full text-left px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
              title="ID/PW表のURLが未設定です"
            >
              ID/PW表を開く
            </span>
          )}
        </div>
      )}
    </div>
  );
}
