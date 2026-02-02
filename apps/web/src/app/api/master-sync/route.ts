import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // ユーザー認証確認
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: admin権限チェック
    // const { data: userRole } = await supabase
    //   .from('user_roles')
    //   .select('role')
    //   .eq('user_id', user.id)
    //   .single();
    // if (userRole?.role !== 'admin') {
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // }

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
    const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:D', // facility_code, channel, login_id, password
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No data found in sheet' }, { status: 404 });
    }

    // 施設情報を取得
    const serviceSupabase = await createServiceClient();
    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('code')
      .eq('id', facility_id)
      .single();

    const { data: channel } = await serviceSupabase
      .from('channels')
      .select('code')
      .eq('id', channel_id)
      .single();

    if (!facility || !channel) {
      return NextResponse.json(
        { error: 'Facility or channel not found' },
        { status: 404 }
      );
    }

    // 該当する行を検索
    const header = rows[0];
    const dataRows = rows.slice(1);

    const targetRow = dataRows.find(
      (row) => row[0] === facility.code && row[1] === channel.code
    );

    if (!targetRow) {
      return NextResponse.json(
        { error: 'No matching data found in master sheet' },
        { status: 404 }
      );
    }

    const [, , loginId, password] = targetRow;

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
