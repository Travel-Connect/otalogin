'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHANNEL_VISUALS } from '@otalogin/shared';
import { ChannelLogo } from '@/components/ChannelLogo';

interface Channel {
  id: string;
  code: string;
  name: string;
  logo_url: string | null;
  bg_color: string | null;
  category: string;
}

interface Props {
  channels: Channel[];
}

export function ChannelLogoSettings({ channels }: Props) {
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [savingColor, setSavingColor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // ローカルのカラー状態（即時プレビュー用）
  const [localColors, setLocalColors] = useState<Record<string, string>>({});

  const handleUpload = async (channelCode: string, file: File) => {
    setUploading(channelCode);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('channelCode', channelCode);
      const res = await fetch('/api/channel/logo', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'アップロードに失敗しました');
      }
      setMessage({ type: 'success', text: `${channelCode} のロゴを更新しました` });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setUploading(null);
    }
  };

  const handleColorChange = async (channelCode: string, color: string) => {
    setLocalColors((prev) => ({ ...prev, [channelCode]: color }));
  };

  const handleColorSave = async (channelCode: string) => {
    const color = localColors[channelCode];
    if (!color) return;
    setSavingColor(channelCode);
    setMessage(null);
    try {
      const res = await fetch('/api/channel/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelCode, bg_color: color }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '色の変更に失敗しました');
      }
      setMessage({ type: 'success', text: `${channelCode} の背景色を変更しました` });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setSavingColor(null);
    }
  };

  const handleColorReset = async (channelCode: string) => {
    setSavingColor(channelCode);
    setMessage(null);
    try {
      const res = await fetch('/api/channel/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelCode, bg_color: null }),
      });
      if (!res.ok) throw new Error('リセットに失敗しました');
      setLocalColors((prev) => {
        const next = { ...prev };
        delete next[channelCode];
        return next;
      });
      setMessage({ type: 'success', text: `${channelCode} の背景色をデフォルトに戻しました` });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'エラーが発生しました' });
    } finally {
      setSavingColor(null);
    }
  };

  const systemsChannels = channels.filter((c) => c.category === 'Systems');
  const otaChannels = channels.filter((c) => c.category !== 'Systems');

  const renderChannelRow = (channel: Channel) => {
    const visual = CHANNEL_VISUALS[channel.code as keyof typeof CHANNEL_VISUALS];
    const defaultBgColor = visual?.bgColor || '#6B7280';
    const currentBgColor = localColors[channel.code] || channel.bg_color || defaultBgColor;
    const textColor = visual?.textColor || '#ffffff';
    const shortName = visual?.shortName || channel.code;
    const faviconDomain = visual?.faviconDomain;
    const isUploading = uploading === channel.code;
    const isSavingColor = savingColor === channel.code;
    const hasCustomColor = !!(localColors[channel.code] || channel.bg_color);
    const colorChanged = localColors[channel.code] && localColors[channel.code] !== (channel.bg_color || defaultBgColor);

    return (
      <div
        key={channel.code}
        className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
      >
        {/* プレビュー */}
        <div
          className="w-[52px] h-[52px] rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: currentBgColor }}
        >
          <ChannelLogo
            shortName={shortName}
            bgColor={currentBgColor}
            textColor={textColor}
            faviconDomain={faviconDomain}
            logoUrl={channel.logo_url}
            size="md"
          />
        </div>

        {/* チャネル名 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{channel.name}</p>
          <p className="text-xs text-gray-400">{channel.code}</p>
        </div>

        {/* カラーピッカー */}
        <div className="flex items-center gap-2">
          <label className="relative cursor-pointer" title="背景色を変更">
            <input
              type="color"
              value={currentBgColor}
              onChange={(e) => handleColorChange(channel.code, e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className="w-8 h-8 rounded-lg border-2 border-gray-200 hover:border-gray-400 transition-colors"
              style={{ backgroundColor: currentBgColor }}
            />
          </label>
          {colorChanged && (
            <button
              onClick={() => handleColorSave(channel.code)}
              disabled={isSavingColor}
              className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSavingColor ? '...' : '保存'}
            </button>
          )}
          {hasCustomColor && !colorChanged && (
            <button
              onClick={() => handleColorReset(channel.code)}
              disabled={isSavingColor}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              title="デフォルト色に戻す"
            >
              リセット
            </button>
          )}
        </div>

        {/* ロゴステータス */}
        {channel.logo_url ? (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">設定済み</span>
        ) : (
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full flex-shrink-0">未設定</span>
        )}

        {/* アップロードボタン */}
        <button
          onClick={() => fileInputRefs.current[channel.code]?.click()}
          disabled={isUploading}
          className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {isUploading ? '...' : channel.logo_url ? '変更' : 'アップロード'}
        </button>
        <input
          ref={(el) => { fileInputRefs.current[channel.code] = el; }}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(channel.code, file);
            e.target.value = '';
          }}
        />
      </div>
    );
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      {message && (
        <div className={`mb-6 px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-6">
        各チャネルのロゴ画像・背景色を設定できます。設定は全施設のダッシュボードに反映されます。
      </p>

      {systemsChannels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Systems</h2>
          <div className="flex flex-col gap-2">
            {systemsChannels.map(renderChannelRow)}
          </div>
        </div>
      )}

      {otaChannels.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">OTA</h2>
          <div className="flex flex-col gap-2">
            {otaChannels.map(renderChannelRow)}
          </div>
        </div>
      )}
    </main>
  );
}
