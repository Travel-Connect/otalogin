import { StatusLamp } from './StatusLamp';
import { ChannelLogo } from './ChannelLogo';
import type { DashboardChannelStatus } from '@/lib/supabase/types';

interface ChannelTileProps {
  channelName: string;
  shortName: string;
  bgColor: string;
  textColor: string;
  status: DashboardChannelStatus;
  variant?: 'ota' | 'systems';
  publicPageUrl?: string | null;
  onClick?: () => void;
}

export function ChannelTile({
  channelName,
  shortName,
  bgColor,
  textColor,
  status,
  variant = 'ota',
  publicPageUrl,
  onClick,
}: ChannelTileProps) {
  const isUnregistered = status === 'unregistered';
  const isClickable = !isUnregistered;

  const cursorClass = isClickable
    ? 'cursor-pointer active:scale-[0.98]'
    : 'cursor-not-allowed';

  const title = isUnregistered ? '未登録' : `${channelName} にログイン`;

  if (variant === 'ota') {
    return (
      <div
        className="flex flex-col rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm overflow-hidden select-none transition-all w-full"
      >
        <div
          className={`relative flex items-center justify-center px-2 py-3 min-h-[56px] ${cursorClass}`}
          style={{ backgroundColor: isUnregistered ? '#E5E7EB' : bgColor }}
          onClick={isClickable ? onClick : undefined}
          title={title}
        >
          <div className="absolute top-1.5 right-1.5">
            <StatusLamp status={status} size="sm" />
          </div>
          <ChannelLogo
            shortName={shortName}
            bgColor={isUnregistered ? '#E5E7EB' : bgColor}
            textColor={isUnregistered ? '#9CA3AF' : textColor}
            disabled={isUnregistered}
          />
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
  const tileBg = isUnregistered ? '#E5E7EB' : bgColor;
  const tileText = isUnregistered ? '#9CA3AF' : textColor;

  return (
    <div className="flex rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm overflow-hidden select-none transition-all w-full">
      <div
        className={`relative flex items-center justify-center flex-shrink-0 w-[56px] min-h-[52px] ${cursorClass}`}
        style={{ backgroundColor: tileBg }}
        onClick={isClickable ? onClick : undefined}
        title={title}
      >
        <ChannelLogo
          shortName={shortName}
          bgColor={tileBg}
          textColor={tileText}
          disabled={isUnregistered}
        />
      </div>
      <div
        className={`relative flex flex-1 items-center px-3 min-h-[52px] ${cursorClass}`}
        style={{ backgroundColor: tileBg }}
        onClick={isClickable ? onClick : undefined}
        title={title}
      >
        <div className="absolute top-1.5 right-1.5">
          <StatusLamp status={status} size="sm" />
        </div>
        <span className="text-xs font-medium leading-tight pr-4" style={{ color: tileText }}>
          {shortName}
        </span>
      </div>
    </div>
  );
}
