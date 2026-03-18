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

    // デバイストークンを生成
    const deviceToken = randomBytes(32).toString('hex');

    // デバイストークンをDBに保存
    const { error: insertError } = await supabase.from('device_tokens').insert({
      token: deviceToken,
      device_name,
    });

    if (insertError) {
      return NextResponse.json(
        { success: false, error: 'Failed to save device token' },
        { status: 500 }
      );
    }

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
