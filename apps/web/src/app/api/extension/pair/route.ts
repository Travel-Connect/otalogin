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

    const { device_name } = parsed.data;

    const supabase = await createServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 500 }
      );
    }

    // デバイストークンを生成
    const deviceToken = randomBytes(32).toString('hex');

    // デバイストークンをDBに保存
    const { error: insertError } = await supabase.from('device_tokens').insert({
      token: deviceToken,
      device_name,
    });

    if (insertError) {
      console.error('[Pair] Failed to insert device token:', insertError);
      return NextResponse.json(
        { success: false, error: `Failed to save device token: ${insertError.message}` },
        { status: 500 }
      );
    }

    // 保存を検証
    const { data: verify } = await supabase
      .from('device_tokens')
      .select('id')
      .eq('token', deviceToken)
      .single();

    if (!verify) {
      console.error('[Pair] Token insert succeeded but verification failed');
      return NextResponse.json(
        { success: false, error: 'Token verification failed after insert' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      device_token: deviceToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pair] Unexpected error:', message);
    return NextResponse.json(
      { success: false, error: 'Failed to pair device', details: message },
      { status: 500 }
    );
  }
}
