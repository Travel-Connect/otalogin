import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 認証チェック
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

    if (!name && !code) {
      return NextResponse.json(
        { error: '施設名または施設コードを指定してください' },
        { status: 400 }
      );
    }

    // 更新データを構築
    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code.trim();

    // 空文字チェック
    if (updateData.name === '' || updateData.code === '') {
      return NextResponse.json(
        { error: '施設名・施設コードは空にできません' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from('facilities')
      .update(updateData)
      .eq('id', facilityId);

    if (updateError) {
      return NextResponse.json(
        { error: '施設情報の更新に失敗しました', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
