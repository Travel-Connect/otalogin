'use client';

import { useState } from 'react';

interface ChannelLogoProps {
  shortName: string;
  bgColor: string;
  textColor: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  faviconDomain?: string;
  /** アップロード済みロゴURL（最優先） */
  logoUrl?: string | null;
}

function initials(name: string) {
  return /^[A-Za-z]/.test(name) ? name.slice(0, 2).toUpperCase() : name.slice(0, 1);
}

const SIZE_MAP = {
  sm: { outer: 'w-10 h-10', text: 'text-xs', radius: 'rounded-lg', iconSize: 24 },
  md: { outer: 'w-[52px] h-[52px]', text: 'text-sm', radius: 'rounded-xl', iconSize: 32 },
};

export function ChannelLogo({ shortName, bgColor, textColor, disabled = false, size = 'sm', faviconDomain, logoUrl }: ChannelLogoProps) {
  const s = SIZE_MAP[size];
  const bg = disabled ? '#E5E7EB' : bgColor;
  const color = disabled ? '#9CA3AF' : textColor;
  const [imgError, setImgError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const uploadedUrl = logoUrl && !disabled && !imgError ? logoUrl : null;
  const faviconUrl = !uploadedUrl && faviconDomain && !disabled && !faviconError
    ? `https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=64`
    : null;

  // アップロード済みロゴ: 高さ50px固定、横幅は画像に合わせる
  if (uploadedUrl) {
    return (
      <div className="flex items-center justify-center flex-shrink-0 select-none">
        <img
          src={uploadedUrl}
          alt={shortName}
          className="object-contain rounded-sm"
          style={{ height: 50, width: 'auto', maxWidth: 120 }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // ファビコン / イニシャル: 従来の正方形
  return (
    <div
      className={`${s.outer} ${s.radius} flex items-center justify-center flex-shrink-0 select-none`}
      style={{ backgroundColor: bg }}
    >
      {faviconUrl ? (
        <img
          src={faviconUrl}
          alt={shortName}
          width={s.iconSize}
          height={s.iconSize}
          className="rounded-sm"
          onError={() => setFaviconError(true)}
        />
      ) : (
        <span className={`${s.text} font-bold leading-none`} style={{ color }}>
          {initials(shortName)}
        </span>
      )}
    </div>
  );
}
