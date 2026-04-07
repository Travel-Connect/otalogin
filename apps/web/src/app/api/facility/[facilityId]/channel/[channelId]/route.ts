import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { matchFacilityAndChannel } from '@/lib/master-sheet/match-row';
import { deleteMatchingRows } from '@/lib/google-sheets/delete-row';

/**
 * DELETE /api/facility/[facilityId]/channel/[channelId]
 *
 * 指定された (facility, channel) を DB と マスタPWシートの両方から削除する。
 * リンカーンの場合はユーザー別行も全て削除する。
 *
 * 順序: シート削除 → facility_accounts 削除 → channel_health_status 削除
 * シート削除失敗時は DB を触らずエラー返却。シート削除成功 + DB 失敗時は
 * 次回 export で復活するためデータロスなし。
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string; channelId: string }> }
) {
  try {
    const { facilityId, channelId } = await params;

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

    // admin チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const serviceSupabase = await createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // facility / channel 取得
    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('id, code, name')
      .eq('id', facilityId)
      .single();
    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 });
    }

    const { data: channel } = await serviceSupabase
      .from('channels')
      .select('id, code, name')
      .eq('id', channelId)
      .single();
    if (!channel) {
      return NextResponse.json({ error: 'チャネルが見つかりません' }, { status: 404 });
    }

    // ===== 1. マスタPWシートの該当行を物理削除 =====
    let deletedRows = 0;
    try {
      const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;
      if (!serviceAccountKey || !spreadsheetId) {
        return NextResponse.json(
          { error: 'Google Sheets が設定されていません' },
          { status: 500 }
        );
      }

      const credentials = JSON.parse(serviceAccountKey);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });

      deletedRows = await deleteMatchingRows(
        sheets,
        spreadsheetId,
        '施設×OTAアカウント',
        (row) =>
          matchFacilityAndChannel(
            row,
            facility,
            { code: channel.code, name: channel.name },
            { ignoreUserEmail: true }
          )
      );
    } catch (sheetError) {
      const msg = sheetError instanceof Error ? sheetError.message : 'Unknown error';
      return NextResponse.json(
        { error: 'マスタシートの削除に失敗しました', details: msg },
        { status: 500 }
      );
    }

    // ===== 2. facility_accounts 削除 (CASCADE で account_field_values も削除) =====
    const { error: accountsError } = await serviceSupabase
      .from('facility_accounts')
      .delete()
      .eq('facility_id', facilityId)
      .eq('channel_id', channelId);

    if (accountsError) {
      return NextResponse.json(
        {
          error: 'DB の削除に失敗しました（マスタシートは削除済み。次回 export で復活します）',
          details: accountsError.message,
        },
        { status: 500 }
      );
    }

    // ===== 3. channel_health_status 削除 =====
    const { error: healthError } = await serviceSupabase
      .from('channel_health_status')
      .delete()
      .eq('facility_id', facilityId)
      .eq('channel_id', channelId);

    if (healthError) {
      console.warn('[delete channel] channel_health_status delete failed:', healthError.message);
    }

    return NextResponse.json({
      success: true,
      channel_name: channel.name,
      deleted_rows: deletedRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
