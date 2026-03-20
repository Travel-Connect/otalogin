import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;

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

    // 施設の存在確認
    const { data: facility } = await supabase
      .from('facilities')
      .select('id, name')
      .eq('id', facilityId)
      .single();

    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 });
    }

    // 削除（CASCADE で関連データも自動削除）
    const { error: deleteError } = await supabase
      .from('facilities')
      .delete()
      .eq('id', facilityId);

    if (deleteError) {
      return NextResponse.json(
        { error: '施設の削除に失敗しました', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: facility.name });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const { name, code, credential_sheet_url } = body;

    if (name === undefined && code === undefined && credential_sheet_url === undefined) {
      return NextResponse.json(
        { error: '更新するフィールドを指定してください' },
        { status: 400 }
      );
    }

    // 更新データを構築
    const updateData: Record<string, string | null> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code.trim();
    if (credential_sheet_url !== undefined) {
      updateData.credential_sheet_url = credential_sheet_url?.trim() || null;
    }

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
