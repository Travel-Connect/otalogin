/**
 * URLクエリパラメータのサニタイズ・検証ユーティリティ
 *
 * 公開ページURL / 管理画面URL のクエリを安全に保存するために使用
 */

/** セッション/トークン系パラメータの拒否リスト（小文字で比較） */
export const QUERY_DENYLIST: string[] = [
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'session',
  'sessionid',
  'sid',
  'auth',
  'auth_token',
  'code',
  'state',
  'nonce',
  'sig',
  'signature',
  'jwt',
  'sso',
  'csrf',
  'xsrf',
  'secret',
  'password',
  'pwd',
  'api_key',
  'apikey',
];

/**
 * クエリパラメータオブジェクトからセッション/トークン系のキーを除去する
 */
export function sanitizeQueryParams(
  params: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();
    if (!QUERY_DENYLIST.includes(lowerKey)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * URLからクエリパラメータを抽出し、サニタイズして返す
 * @param url 抽出元のフルURL
 * @param allowedDomains 許可するドメインリスト（一致チェック）
 * @returns サニタイズ済みパラメータ or null（ドメイン不一致時）
 */
export function extractAndSanitizeQuery(
  url: string,
  allowedDomains: string[]
): Record<string, string> | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // ドメインチェック
  const hostname = parsed.hostname.toLowerCase();
  const domainMatch = allowedDomains.some((domain) => {
    const d = domain.toLowerCase();
    return hostname === d || hostname.endsWith('.' + d);
  });
  if (!domainMatch) {
    return null;
  }

  // searchParams → Record変換 → サニタイズ
  const params: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return sanitizeQueryParams(params);
}

/**
 * クエリオブジェクトをURLクエリ文字列に変換（先頭の ? なし）
 */
export function buildQueryString(params: Record<string, string>): string {
  const sp = new URLSearchParams(params);
  return sp.toString();
}

/**
 * ベースURLとクエリオブジェクトからフルURLを構築する
 */
export function buildFullUrl(
  baseUrl: string,
  query: Record<string, string> | null
): string {
  if (!query || Object.keys(query).length === 0) {
    return baseUrl;
  }
  const separator = baseUrl.includes('?') ? '&' : '?';
  return baseUrl + separator + buildQueryString(query);
}
