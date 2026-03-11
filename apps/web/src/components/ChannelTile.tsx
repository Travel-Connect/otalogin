'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusLamp } from './StatusLamp';
import { ChannelLogo } from './ChannelLogo';
import type { DashboardChannelStatus } from '@/lib/supabase/types';

interface ChannelTileProps {
  channelCode: string;
  channelName: string;
  shortName: string;
  bgColor: string;
  textColor: string;
  status: DashboardChannelStatus;
  variant?: 'ota' | 'systems';
  publicPageUrl?: string | null;
  faviconDomain?: string;
  logoUrl?: string | null;
  linkOnly?: boolean;
  onClick?: () => void;
}

export function ChannelTile({
  channelCode,
  channelName,
  shortName,
  bgColor,
  textColor,
  status,
  variant = 'ota',
  publicPageUrl,
  faviconDomain,
  logoUrl,
  linkOnly,
  onClick,
}: ChannelTileProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const isUnregistered = status === 'unregistered';
  // リンク専用チャネル: 常にカラー表示、ログインなし
  const isLinkOnlyChannel = !!linkOnly;
  const showColored = isLinkOnlyChannel || !isUnregistered;
  const isClickable = !isLinkOnlyChannel && !isUnregistered;

  const cursorClass = isClickable
    ? 'cursor-pointer active:scale-[0.98]'
    : showColored ? 'cursor-default' : 'cursor-not-allowed';

  const title = isLinkOnlyChannel
    ? channelName
    : isUnregistered ? '未登録' : `${channelName} にログイン`;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('channelCode', channelCode);
      const res = await fetch('/api/channel/logo', { method: 'POST', body: formData });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const tileBg = showColored ? bgColor : '#E5E7EB';
  const tileText = showColored ? textColor : '#9CA3AF';
  const lampStatus = isLinkOnlyChannel && publicPageUrl ? 'link' : status;

  // ロゴエリア（アップロードオーバーレイ付き）
  const logoArea = (
    <div className="group/logo relative">
      <ChannelLogo
        shortName={shortName}
        bgColor={tileBg}
        textColor={tileText}
        disabled={!showColored}
        faviconDomain={faviconDomain}
        logoUrl={logoUrl}
      />
      {/* アップロードオーバーレイ（ホバー時表示） */}
      <button
        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover/logo:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        title="ロゴをアップロード"
        disabled={uploading}
      >
        {uploading ? (
          <svg className="w-4 h-4 text-white animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
        className="hidden"
        onChange={handleLogoUpload}
      />
    </div>
  );

  if (variant === 'ota') {
    return (
      <div className="flex flex-col rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm overflow-hidden select-none transition-all w-full">
        <div
          className={`relative flex items-center justify-center px-2 py-3 min-h-[56px] ${cursorClass}`}
          style={{ backgroundColor: tileBg }}
          onClick={isClickable ? onClick : undefined}
          title={title}
        >
          <div className="absolute top-1.5 right-1.5">
            <StatusLamp status={lampStatus} size="sm" />
          </div>
          {logoArea}
        </div>
        {publicPageUrl && (
          <a
            href={publicPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 px-2 py-1 bg-gray-50 text-[10px] text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-gray-100"
            onClick={(e) => e.stopPropagation()}
            title={`${channelName} 公開ページ`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            公開
          </a>
        )}
      </div>
    );
  }

  // Systems variant (horizontal)
  return (
    <div className="flex rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm overflow-hidden select-none transition-all w-full">
      <div
        className={`relative flex items-center justify-center flex-shrink-0 w-[56px] min-h-[52px] ${cursorClass}`}
        style={{ backgroundColor: tileBg }}
        onClick={isClickable ? onClick : undefined}
        title={title}
      >
        {logoArea}
      </div>
      <div
        className={`relative flex flex-1 items-center px-3 min-h-[52px] ${cursorClass}`}
        style={{ backgroundColor: tileBg }}
        onClick={isClickable ? onClick : undefined}
        title={title}
      >
        <div className="absolute top-1.5 right-1.5">
          <StatusLamp status={lampStatus} size="sm" />
        </div>
        <span className="text-xs font-medium leading-tight pr-4" style={{ color: tileText }}>
          {shortName}
        </span>
      </div>
    </div>
  );
}
