import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/shortcuts
 * ログインユーザーのショートカット一覧を取得（施設・チャネル名をJOIN）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS が user_id = auth.uid() を強制するため、フィルタ不要
    const { data: shortcuts, error } = await supabase
      .from('user_shortcuts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 施設・チャネル名を取得して結合
    const facilityIds = Array.from(new Set((shortcuts || []).map((s) => s.facility_id)));
    const channelIds = Array.from(new Set((shortcuts || []).map((s) => s.channel_id)));

    const [facilitiesResult, channelsResult] = await Promise.all([
      facilityIds.length > 0
        ? supabase.from('facilities').select('id, name, code').in('id', facilityIds)
        : { data: [] },
      channelIds.length > 0
        ? supabase.from('channels').select('id, name, code').in('id', channelIds)
        : { data: [] },
    ]);

    const facilityMap = new Map(
      (facilitiesResult.data || []).map((f) => [f.id, f])
    );
    const channelMap = new Map(
      (channelsResult.data || []).map((c) => [c.id, c])
    );

    const enriched = (shortcuts || []).map((s) => {
      const facility = facilityMap.get(s.facility_id);
      const channel = channelMap.get(s.channel_id);
      return {
        ...s,
        facility_name: facility?.name || '(削除済み)',
        facility_code: facility?.code || '',
        channel_name: channel?.name || '(削除済み)',
        channel_code: channel?.code || '',
      };
    });

    return NextResponse.json({ shortcuts: enriched });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/shortcuts
 * ショートカットを新規作成
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, facility_id, channel_id, action_type, slot_no } = body as {
      name: string;
      facility_id: string;
      channel_id: string;
      action_type: 'login' | 'public';
      slot_no?: number | null;
    };

    if (!name?.trim() || !facility_id || !channel_id || !action_type) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    if (!['login', 'public'].includes(action_type)) {
      return NextResponse.json({ error: '無効なaction_typeです' }, { status: 400 });
    }

    if (slot_no != null && (slot_no < 1 || slot_no > 10)) {
      return NextResponse.json({ error: 'slot_noは1-10の範囲で指定してください' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_shortcuts')
      .insert({
        user_id: user.id,
        name: name.trim(),
        facility_id,
        channel_id,
        action_type,
        slot_no: slot_no ?? null,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'このスロット番号は既に使用されています' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ shortcut: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
