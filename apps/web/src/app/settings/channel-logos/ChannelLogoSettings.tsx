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
  category: string;
}

interface Props {
  channels: Channel[];
}

export function ChannelLogoSettings({ channels }: Props) {
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const systemsChannels = channels.filter((c) => c.category === 'Systems');
  const otaChannels = channels.filter((c) => c.category !== 'Systems');

  const renderChannelRow = (channel: Channel) => {
    const visual = CHANNEL_VISUALS[channel.code as keyof typeof CHANNEL_VISUALS];
    const bgColor = visual?.bgColor || '#6B7280';
    const textColor = visual?.textColor || '#ffffff';
    const shortName = visual?.shortName || channel.code;
    const faviconDomain = visual?.faviconDomain;
    const isUploading = uploading === channel.code;

    return (
      <div
        key={channel.code}
        className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
      >
        {/* 現在のロゴ */}
        <ChannelLogo
          shortName={shortName}
          bgColor={bgColor}
          textColor={textColor}
          faviconDomain={faviconDomain}
          logoUrl={channel.logo_url}
          size="md"
        />

        {/* チャネル名 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{channel.name}</p>
          <p className="text-xs text-gray-400">{channel.code}</p>
        </div>

        {/* ステータス */}
        {channel.logo_url ? (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">設定済み</span>
        ) : (
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">未設定</span>
        )}

        {/* アップロードボタン */}
        <button
          onClick={() => fileInputRefs.current[channel.code]?.click()}
          disabled={isUploading}
          className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
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
      {/* メッセージ */}
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
        各チャネルのロゴ画像を設定できます。設定したロゴは全施設のダッシュボードに反映されます。
      </p>

      {/* Systems */}
      {systemsChannels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Systems</h2>
          <div className="flex flex-col gap-2">
            {systemsChannels.map(renderChannelRow)}
          </div>
        </div>
      )}

      {/* OTA */}
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
