import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // admin権限チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code } = body;

    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json(
        { error: '施設名と施設コードは必須です' },
        { status: 400 }
      );
    }

    // 施設コードの重複チェック
    const { data: existing } = await supabase
      .from('facilities')
      .select('id')
      .eq('code', code.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `施設コード「${code.trim()}」は既に使用されています` },
        { status: 409 }
      );
    }

    const { data: facility, error: insertError } = await supabase
      .from('facilities')
      .insert({
        name: name.trim(),
        code: code.trim(),
      })
      .select('id, name, code')
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: '施設の作成に失敗しました', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, facility });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
