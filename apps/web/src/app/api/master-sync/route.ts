import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { encryptPassword } from '@/lib/crypto/credentials';

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
    // シート形式: 施設ID | 施設名 | OTA | ID | PW | ログインURL | 追加ID（施設コード等） | ... | K=るるぶ施設コード
    const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '施設×OTAアカウント!A:K',
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

    // 列インデックス: 0=施設ID, 1=施設名, 2=OTA, 3=ID, 4=PW, 5=ログインURL, 6=オペレータID, 7=契約コード, ..., 10=るるぶ施設コード(K列)
    const loginId = targetRow[3]?.toString().trim();
    const password = targetRow[4]?.toString().trim();
    const loginUrl = targetRow[5]?.toString().trim() || null;

    // OTP認証チャネル（パスワード不要）
    const otpChannels = ['rurubu'];
    const isOtpChannel = otpChannels.includes(channel.code);

    // ログインIDは必須、パスワードはOTPチャネル以外で必須
    if (!loginId) {
      return NextResponse.json(
        { error: 'シートにログインIDがありません' },
        { status: 400 }
      );
    }
    if (!password && !isOtpChannel) {
      return NextResponse.json(
        { error: 'シートにパスワードがありません' },
        { status: 400 }
      );
    }

    // パスワードを暗号化（OTPチャネルはパスワードなしの場合あり）
    const encryptedPassword = password ? encryptPassword(password) : null;

    // アカウント情報を更新（暗号化パスワードを保存）
    const { error: upsertError } = await serviceSupabase
      .from('facility_accounts')
      .upsert(
        {
          facility_id,
          channel_id,
          account_type: 'shared',
          login_id: loginId,
          password_encrypted: encryptedPassword,
          // password は移行期間中のみ保持（将来削除）
          password: null,
          // 施設固有のログインURL（スプレッドシートF列）
          login_url: loginUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'facility_id,channel_id,account_type',
        }
      );

    if (upsertError) {
      throw upsertError;
    }

    // upsert後にアカウントIDを取得
    const { data: upsertedAccount } = await serviceSupabase
      .from('facility_accounts')
      .select('id')
      .eq('facility_id', facility_id)
      .eq('channel_id', channel_id)
      .eq('account_type', 'shared')
      .single();

    if (!upsertedAccount) {
      throw new Error('Account not found after upsert');
    }

    // 追加フィールド値を同期
    // G列(6): オペレータID(一休) / 施設ID(楽天), H列(7): 契約コード(ねっぱん), K列(10): るるぶ施設コード
    const extraFieldColumnMap: Record<string, number> = {
      neppan: 7,   // H列: 契約コード
      ikyu: 6,     // G列: オペレータID
      rakuten: 6,  // G列: 施設ID
      rurubu: 10,  // K列: るるぶ施設コード
    };
    const extraColIndex = extraFieldColumnMap[channel.code] ?? 6;
    const extraFieldValue = targetRow[extraColIndex]?.toString().trim();
    if (extraFieldValue) {
      // チャネルのフィールド定義を取得
      const { data: fieldDefs } = await serviceSupabase
        .from('account_field_definitions')
        .select('id, field_key')
        .eq('channel_id', channel_id)
        .order('display_order');

      if (fieldDefs && fieldDefs.length > 0) {
        // G列の値を最初のフィールド定義に紐付け
        const firstFieldDef = fieldDefs[0];

        // 既存の値を確認
        const { data: existingValue } = await serviceSupabase
          .from('account_field_values')
          .select('id')
          .eq('facility_account_id', upsertedAccount.id)
          .eq('field_definition_id', firstFieldDef.id)
          .single();

        if (existingValue) {
          await serviceSupabase
            .from('account_field_values')
            .update({ value: extraFieldValue })
            .eq('id', existingValue.id);
        } else {
          await serviceSupabase
            .from('account_field_values')
            .insert({
              facility_account_id: upsertedAccount.id,
              field_definition_id: firstFieldDef.id,
              value: extraFieldValue,
            });
        }
      }
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
