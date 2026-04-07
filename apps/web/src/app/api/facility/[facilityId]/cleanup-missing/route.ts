import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/facility/[facilityId]/cleanup-missing
 *
 * フロントが master-sync の missing_in_sheet で選択したチャネルを削除する。
 * シートには既に存在しないため DB のみ削除する。
 *
 * Body: { channel_ids: string[] }
 * Response: { success, deleted, message }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 認証
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // admin 権限チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // body 検証
    const body = await request.json();
    const { channel_ids } = body as { channel_ids?: unknown };
    if (!Array.isArray(channel_ids) || channel_ids.length === 0) {
      return NextResponse.json(
        { error: 'channel_ids は1件以上必要です' },
        { status: 400 }
      );
    }
    if (!channel_ids.every((c) => typeof c === 'string' && c.length > 0)) {
      return NextResponse.json(
        { error: 'channel_ids は文字列の配列である必要があります' },
        { status: 400 }
      );
    }

    const serviceSupabase = await createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // facility 存在確認
    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('id')
      .eq('id', facilityId)
      .single();
    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 });
    }

    // 削除（facility_accounts → ON DELETE CASCADE で account_field_values も削除される）
    const { error: accountsError } = await serviceSupabase
      .from('facility_accounts')
      .delete()
      .eq('facility_id', facilityId)
      .in('channel_id', channel_ids as string[]);

    if (accountsError) {
      return NextResponse.json(
        { error: 'アカウントの削除に失敗しました', details: accountsError.message },
        { status: 500 }
      );
    }

    // channel_health_status も削除
    const { error: healthError } = await serviceSupabase
      .from('channel_health_status')
      .delete()
      .eq('facility_id', facilityId)
      .in('channel_id', channel_ids as string[]);

    if (healthError) {
      // ヘルス削除失敗は warning にとどめる（次回ヘルスチェックで自然に整合する）
      console.warn('[cleanup-missing] channel_health_status delete failed:', healthError.message);
    }

    return NextResponse.json({
      success: true,
      deleted: channel_ids.length,
      message: `${channel_ids.length}チャネルを削除しました`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
