import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { channelCode, bg_color } = body;

  if (!channelCode) {
    return NextResponse.json({ error: 'channelCode is required' }, { status: 400 });
  }

  if (bg_color && !/^#[0-9a-fA-F]{6}$/.test(bg_color)) {
    return NextResponse.json({ error: 'Invalid color format (use #RRGGBB)' }, { status: 400 });
  }

  const serviceSupabase = await createServiceClient();
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service client not available' }, { status: 500 });
  }

  await serviceSupabase
    .from('channels')
    .update({ bg_color: bg_color || null })
    .eq('code', channelCode);

  return NextResponse.json({ success: true });
}
