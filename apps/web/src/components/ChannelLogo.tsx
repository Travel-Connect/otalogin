'use client';

import { useState } from 'react';

interface ChannelLogoProps {
  shortName: string;
  bgColor: string;
  textColor: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  faviconDomain?: string;
}

function initials(name: string) {
  return /^[A-Za-z]/.test(name) ? name.slice(0, 2).toUpperCase() : name.slice(0, 1);
}

const SIZE_MAP = {
  sm: { outer: 'w-10 h-10', text: 'text-xs', radius: 'rounded-lg', iconSize: 20 },
  md: { outer: 'w-[52px] h-[52px]', text: 'text-sm', radius: 'rounded-xl', iconSize: 28 },
};

export function ChannelLogo({ shortName, bgColor, textColor, disabled = false, size = 'sm', faviconDomain }: ChannelLogoProps) {
  const s = SIZE_MAP[size];
  const bg = disabled ? '#E5E7EB' : bgColor;
  const color = disabled ? '#9CA3AF' : textColor;
  const [imgError, setImgError] = useState(false);

  const faviconUrl = faviconDomain && !disabled && !imgError
    ? `https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=64`
    : null;

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
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={`${s.text} font-bold leading-none`} style={{ color }}>
          {initials(shortName)}
        </span>
      )}
    </div>
  );
}
