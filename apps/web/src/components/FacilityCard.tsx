'use client';

import { CHANNEL_VISUALS, CHANNEL_CONFIGS, type ChannelCategory } from '@otalogin/shared';
import { ChannelTile } from './ChannelTile';
import { FacilityMenu } from './FacilityMenu';
import type { DashboardFacility, DashboardChannelInfo } from '@/lib/supabase/types';

interface FacilityCardProps {
  facility: DashboardFacility;
  onChannelLogin: (facilityId: string, channelId: string, channelCode: string) => void;
}

export function FacilityCard({ facility, onChannelLogin }: FacilityCardProps) {
  const systemsChannels = facility.channels.filter((c) => c.category === 'Systems');
  const otaChannels = facility.channels.filter((c) => c.category === 'OTA');

  function getVisual(code: string) {
    return CHANNEL_VISUALS[code as keyof typeof CHANNEL_VISUALS] ?? {
      shortName: code,
      category: 'OTA' as ChannelCategory,
      bgColor: '#6B7280',
      textColor: '#ffffff',
    };
  }

  function contrastText(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // YIQ brightness formula
    return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? '#1f2937' : '#ffffff';
  }

  function renderTile(ch: DashboardChannelInfo, variant: 'ota' | 'systems') {
    const visual = getVisual(ch.channel_code);
    const config = CHANNEL_CONFIGS[ch.channel_code as keyof typeof CHANNEL_CONFIGS];
    const bg = ch.bg_color || visual.bgColor;
    return (
      <ChannelTile
        key={ch.channel_id}
        channelName={ch.channel_name}
        shortName={visual.shortName}
        bgColor={bg}
        textColor={contrastText(bg)}
        status={ch.status}
        variant={variant}
        publicPageUrl={ch.public_page_url}
        faviconDomain={visual.faviconDomain}
        logoUrl={ch.logo_url}
        linkOnly={config?.link_only}
        onClick={() => onChannelLogin(facility.id, ch.channel_id, ch.channel_code)}
      />
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md">
      {/* Card header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-gray-900 truncate font-medium">{facility.name}</h2>
            {facility.official_site_url && (
              <a
                href={facility.official_site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-gray-400 hover:text-indigo-600 transition-colors"
                title="公式サイト"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {facility.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <FacilityMenu facilityId={facility.id} />
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-gray-100" />

      {/* Channel sections */}
      <div className="flex gap-0 px-0">
        {/* Systems column */}
        {systemsChannels.length > 0 && (
          <div className="w-[38%] border-r border-gray-100 px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Systems
            </p>
            <div className="flex flex-col gap-2">
              {systemsChannels.map((ch) => renderTile(ch, 'systems'))}
            </div>
          </div>
        )}

        {/* OTA column */}
        <div className={`flex-1 px-4 py-3 ${systemsChannels.length === 0 ? '' : ''}`}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            OTA
          </p>
          <div className="grid grid-cols-3 gap-2">
            {otaChannels.map((ch) => renderTile(ch, 'ota'))}
          </div>
        </div>
      </div>

      {/* Card footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 正常
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> エラー
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> 実行中
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> 未登録
          </span>
        </div>
      </div>
    </div>
  );
}
