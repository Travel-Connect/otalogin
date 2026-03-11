import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * デバイストークン認証結果
 */
export type DeviceAuthResult =
  | { success: true; deviceId: string }
  | { success: false; response: NextResponse };

/**
 * デバイストークンを検証する共通関数
 *
 * @param request - NextRequest
 * @returns 認証成功時は deviceId、失敗時は適切なエラーレスポンス
 */
export async function verifyDeviceToken(request: NextRequest): Promise<DeviceAuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const deviceToken = authHeader.slice(7);
  const supabase = await createServiceClient();
  if (!supabase) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
    };
  }

  // デバイストークンの検証
  const { data: device, error: deviceError } = await supabase
    .from('device_tokens')
    .select('id')
    .eq('token', deviceToken)
    .single();

  if (deviceError || !device) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Invalid device token' }, { status: 401 }),
    };
  }

  // last_used_at を更新
  await supabase
    .from('device_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', device.id);

  return {
    success: true,
    deviceId: device.id,
  };
}
