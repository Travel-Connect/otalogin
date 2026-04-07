/**
 * マスタPWシートの行と (facility, channel) のマッチングロジック。
 *
 * master-sync / master-export / 削除APIから共通利用される。
 * 既存挙動 (master-sync/route.ts:170-187, master-export/route.ts:175-199) と
 * 同じ判定にすること。
 */

export interface FacilityForMatch {
  id: string;
  code: string | null;
}

export interface ChannelForMatch {
  code: string;
  name: string;
}

export interface MatchOptions {
  /**
   * リンカーン (lincoln) のユーザー別クレデンシャルで、特定ユーザーの行だけにマッチさせたい場合に指定する。
   * undefined または null の場合は user_email を比較しない（全ユーザーにマッチ）。
   */
  userEmail?: string | null;
  /**
   * true の場合、user_email を一切見ずに施設×チャネルだけで一致判定する。
   * 削除APIで利用（リンカーンの全ユーザー行を一括削除するため）。
   */
  ignoreUserEmail?: boolean;
}

/**
 * スプレッドシートのOTA名 → チャネルコードのエイリアス。
 * master-sync / master-export と同じテーブルを共有する。
 */
export const SHEET_OTA_ALIASES: Record<string, string> = {
  moana: 'temairazu',
  '予約プロ': 'yoyakupro',
  '489pro': 'yoyakupro',
  トリプラ: 'tripla',
  チルン: 'chillnn',
  ミンパクイン: 'minpakuin',
  'booking.com': 'booking',
  booking: 'booking',
  'trip.com': 'tripcom',
  tripcom: 'tripcom',
  agoda: 'agoda',
  'agoda.com': 'agoda',
  expedia: 'expedia',
  'expedia.com': 'expedia',
};

/**
 * 行が指定 (facility, channel) にマッチするか判定する。
 * 列: 0=施設ID, 2=OTA, 11=ユーザーメール
 */
export function matchFacilityAndChannel(
  row: string[],
  facility: FacilityForMatch,
  channel: ChannelForMatch,
  opts: MatchOptions = {}
): boolean {
  const sheetFacilityId = row[0]?.toString().trim();
  const sheetOTA = row[2]?.toString().trim();

  const facilityMatch =
    sheetFacilityId === facility.code ||
    sheetFacilityId === facility.id ||
    (sheetFacilityId ? facility.id.startsWith(sheetFacilityId) : false);

  if (!facilityMatch) return false;

  const sheetOTALower = sheetOTA?.toLowerCase() ?? '';
  const channelMatch =
    sheetOTA === channel.name ||
    sheetOTA === channel.code ||
    sheetOTALower === channel.code?.toLowerCase() ||
    SHEET_OTA_ALIASES[sheetOTALower] === channel.code;

  if (!channelMatch) return false;

  // user_email チェック
  if (opts.ignoreUserEmail) {
    return true;
  }
  if (opts.userEmail) {
    const sheetEmail = row[11]?.toString().trim();
    return sheetEmail === opts.userEmail;
  }
  return true;
}
