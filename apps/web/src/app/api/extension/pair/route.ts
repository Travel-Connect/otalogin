import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { PairingRequestSchema } from '@otalogin/shared';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PairingRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { pairing_code: _pairing_code, device_name: _device_name } = parsed.data;

    const _supabase = await createServiceClient(); // TODO: use for device token storage

    // ペアリングコードの検証
    // TODO: pairing_codes テーブルで検証
    // const { data: code } = await supabase
    //   .from('pairing_codes')
    //   .select('*')
    //   .eq('code', pairing_code)
    //   .eq('used', false)
    //   .gt('expires_at', new Date().toISOString())
    //   .single();

    // if (!code) {
    //   return NextResponse.json(
    //     { success: false, error: 'Invalid or expired pairing code' },
    //     { status: 400 }
    //   );
    // }

    // デバイストークンを生成
    const deviceToken = randomBytes(32).toString('hex');

    // デバイストークンを保存
    // TODO: device_tokens テーブルに保存
    // await supabase.from('device_tokens').insert({
    //   token: deviceToken,
    //   device_name,
    //   created_at: new Date().toISOString(),
    // });

    // ペアリングコードを使用済みにマーク
    // await supabase
    //   .from('pairing_codes')
    //   .update({ used: true })
    //   .eq('code', pairing_code);

    return NextResponse.json({
      success: true,
      device_token: deviceToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to pair device', details: message },
      { status: 500 }
    );
  }
}
