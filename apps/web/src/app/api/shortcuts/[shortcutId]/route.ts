import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ shortcutId: string }>;
}

/**
 * PATCH /api/shortcuts/[shortcutId]
 * ショートカットを更新（名前、action_type、slot_no、enabled）
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { shortcutId } = await params;
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.action_type !== undefined) {
      if (!['login', 'public'].includes(body.action_type)) {
        return NextResponse.json({ error: '無効なaction_typeです' }, { status: 400 });
      }
      updates.action_type = body.action_type;
    }
    if (body.slot_no !== undefined) {
      if (body.slot_no !== null && (body.slot_no < 1 || body.slot_no > 10)) {
        return NextResponse.json({ error: 'slot_noは1-10の範囲で指定してください' }, { status: 400 });
      }
      updates.slot_no = body.slot_no;
    }
    if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);
    if (body.facility_id !== undefined) updates.facility_id = body.facility_id;
    if (body.channel_id !== undefined) updates.channel_id = body.channel_id;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '更新項目がありません' }, { status: 400 });
    }

    // RLS で user_id = auth.uid() が強制される
    const { data, error } = await supabase
      .from('user_shortcuts')
      .update(updates)
      .eq('id', shortcutId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'このスロット番号は既に使用されています' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'ショートカットが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ shortcut: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/shortcuts/[shortcutId]
 * ショートカットを削除
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { shortcutId } = await params;
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS で user_id = auth.uid() が強制される
    const { error } = await supabase
      .from('user_shortcuts')
      .delete()
      .eq('id', shortcutId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
