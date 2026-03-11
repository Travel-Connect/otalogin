import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
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

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const channelCode = formData.get('channelCode') as string;

  if (!file || !channelCode) {
    return NextResponse.json({ error: 'file and channelCode are required' }, { status: 400 });
  }

  if (file.size > 1 * 1024 * 1024) {
    return NextResponse.json({ error: 'ファイルサイズは1MB以下にしてください' }, { status: 400 });
  }

  const serviceSupabase = await createServiceClient();
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service client not available' }, { status: 500 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'png';
  const path = `${channelCode}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await serviceSupabase.storage
    .from('channel-logos')
    .upload(path, buffer, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL with cache-busting
  const { data: urlData } = serviceSupabase.storage
    .from('channel-logos')
    .getPublicUrl(path);

  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  // Update channels table
  await serviceSupabase
    .from('channels')
    .update({ logo_url: logoUrl })
    .eq('code', channelCode);

  return NextResponse.json({ logo_url: logoUrl });
}
