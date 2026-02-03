import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // ユーザー認証確認
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
    const { facility_id, channel_id } = body;

    if (!facility_id || !channel_id) {
      return NextResponse.json(
        { error: 'facility_id and channel_id are required' },
        { status: 400 }
      );
    }

    // Google Sheets API クライアントを作成
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // マスタPWシートからデータを取得
    // シート形式: 施設ID | 施設名 | OTA | ID | PW | ログインURL | オペレータID(一休)
    const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '施設×OTAアカウント!A:G',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'シートにデータがありません' }, { status: 404 });
    }

    // 施設・チャネル情報を取得
    const serviceSupabase = await createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }
    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('id, code, name')
      .eq('id', facility_id)
      .single();

    const { data: channel } = await serviceSupabase
      .from('channels')
      .select('id, code, name')
      .eq('id', channel_id)
      .single();

    if (!facility || !channel) {
      return NextResponse.json(
        { error: '施設またはチャネルが見つかりません' },
        { status: 404 }
      );
    }

    // 該当する行を検索
    // ヘッダー行をスキップし、説明行（2行目）もスキップ
    const dataRows = rows.slice(2);

    // マッチング: 施設ID(col 0) = facility.code, OTA(col 2) = channel.name
    const targetRow = dataRows.find((row) => {
      const sheetFacilityId = row[0]?.toString().trim();
      const sheetOTA = row[2]?.toString().trim();

      // 施設IDでマッチ（facility.code または facility.id の一部）
      const facilityMatch =
        sheetFacilityId === facility.code ||
        sheetFacilityId === facility.id ||
        facility.id.startsWith(sheetFacilityId);

      // OTA名でマッチ（channel.name または channel.code）
      const channelMatch =
        sheetOTA === channel.name ||
        sheetOTA === channel.code ||
        sheetOTA?.toLowerCase() === channel.code?.toLowerCase();

      return facilityMatch && channelMatch;
    });

    if (!targetRow) {
      return NextResponse.json(
        { error: `シートに該当データがありません（施設: ${facility.code}, OTA: ${channel.name}）` },
        { status: 404 }
      );
    }

    // 列インデックス: 0=施設ID, 1=施設名, 2=OTA, 3=ID, 4=PW, 5=ログインURL, 6=オペレータID
    const loginId = targetRow[3]?.toString().trim();
    const password = targetRow[4]?.toString().trim();

    // ログインIDとパスワードが必須
    if (!loginId || !password) {
      return NextResponse.json(
        { error: 'シートにログインIDまたはパスワードがありません' },
        { status: 400 }
      );
    }

    // アカウント情報を更新
    // TODO: パスワードの暗号化
    const { error: upsertError } = await serviceSupabase
      .from('facility_accounts')
      .upsert(
        {
          facility_id,
          channel_id,
          account_type: 'shared',
          login_id: loginId,
          password: password, // TODO: 暗号化
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'facility_id,channel_id,account_type',
        }
      );

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({
      success: true,
      message: 'Account synced from master sheet',
      // 注意: パスワードは絶対に返さない
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to sync with master sheet', details: message },
      { status: 500 }
    );
  }
}
