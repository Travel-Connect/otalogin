/**
 * Chrome 拡張向け CORS ヘルパー
 */

import { NextResponse } from 'next/server';

/**
 * CORS ヘッダーを追加
 */
export function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * CORS プリフライト用レスポンス
 */
export function corsPreflightResponse(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

/**
 * JSON レスポンスに CORS ヘッダーを追加
 */
export function jsonResponseWithCors(
  data: unknown,
  options?: { status?: number }
): NextResponse {
  const response = NextResponse.json(data, options);
  return addCorsHeaders(response);
}
