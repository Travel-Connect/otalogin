/**
 * OTA Connectors
 * 各OTAサイトのログイン処理を定義
 */

import { CHANNEL_CONFIGS, type ChannelCode } from '@otalogin/shared';

export interface ConnectorConfig {
  name: string;
  login_url: string;
  selectors: {
    username: string;
    password: string;
    submit: string;
    success_indicator: string;
  };
  extra_fields?: {
    key: string;
    label: string;
    selector: string;
  }[];
}

/**
 * チャネルコードからコネクタ設定を取得
 */
export function getConnector(channelCode: ChannelCode): ConnectorConfig | null {
  return CHANNEL_CONFIGS[channelCode] || null;
}

/**
 * URLからチャネルコードを推定
 */
export function detectChannelFromUrl(url: string): ChannelCode | null {
  const hostname = new URL(url).hostname;

  if (hostname.includes('rakuten.co.jp')) {
    return 'rakuten';
  }
  if (hostname.includes('jalan.net')) {
    return 'jalan';
  }
  if (hostname.includes('hotel-story.ne.jp')) {
    return 'neppan';
  }

  return null;
}

/**
 * 対象URLかどうかを判定
 */
export function isTargetUrl(url: string): boolean {
  return detectChannelFromUrl(url) !== null;
}
