import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { getPlainPassword } from '@/lib/crypto/credentials';
import { CHANNEL_CONFIGS } from '@otalogin/shared';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // ユーザー認証 + admin権限チェック
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    if (!facility_id) {
      return NextResponse.json({ error: 'facility_id is required' }, { status: 400 });
    }

    // Google Sheets API クライアント
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      return NextResponse.json({ error: 'Google Service Account key not configured' }, { status: 500 });
    }

    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;

    // スプレッドシートの現在データを取得（行マッチング用）
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '施設×OTAアカウント!A:L',
    });
    const rows = sheetResponse.data.values || [];

    // 施設情報を取得
    const serviceSupabase = await createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('id, code, name, official_site_url')
      .eq('id', facility_id)
      .single();

    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 });
    }

    // チャネル取得
    let channels: { id: string; code: string; name: string }[];
    if (channel_id) {
      const { data: channel } = await serviceSupabase
        .from('channels')
        .select('id, code, name')
        .eq('id', channel_id)
        .single();
      if (!channel) {
        return NextResponse.json({ error: 'チャネルが見つかりません' }, { status: 404 });
      }
      channels = [channel];
    } else {
      const { data: allChannels } = await serviceSupabase
        .from('channels')
        .select('id, code, name')
        .order('name');
      channels = allChannels || [];
    }

    // OTA名エイリアス（master-sync と同じ）
    const sheetOtaAliases: Record<string, string> = {
      moana: 'temairazu',
      '予約プロ': 'yoyakupro',
      '489pro': 'yoyakupro',
      トリプラ: 'tripla',
      チルン: 'chillnn',
      ミンパクイン: 'minpakuin',
      'booking.com': 'booking',
      booking: 'booking',
      'trip.com': 'tripcom',
      tripcom: 'tripcom',
      agoda: 'agoda',
      'agoda.com': 'agoda',
      expedia: 'expedia',
      'expedia.com': 'expedia',
    };

    // チャネルコード → スプレッドシート表示名
    const channelDisplayNames: Record<string, string> = {
      rakuten: '楽天トラベル',
      jalan: 'じゃらん',
      neppan: 'ねっぱん',
      ikyu: '一休',
      skyticket: 'スカイチケット',
      churatoku: 'ちゅらとく',
      ots: 'OTS',
      lincoln: 'リンカーン',
      rurubu: 'るるぶ',
      dynaibe: 'DYNA',
      temairazu: 'moana',
      yoyakupro: '予約プロ',
      tripla: 'トリプラ',
      chillnn: 'チルン',
      minpakuin: 'ミンパクイン',
      booking: 'Booking.com',
      tripcom: 'Trip.com',
      agoda: 'Agoda',
      expedia: 'Expedia',
      airbnb: 'Airbnb',
    };

    const dataStartRow = 2; // ヘッダー + 説明行をスキップ
    const results: { channel: string; exported: number; created: number }[] = [];

    for (const channel of channels) {
      const channelConfig = CHANNEL_CONFIGS[channel.code as keyof typeof CHANNEL_CONFIGS];
      const isLinkOnly = channelConfig?.link_only === true;
      const isLincoln = channel.code === 'lincoln';

      // DB からアカウント情報を取得
      const accountQuery = serviceSupabase
        .from('facility_accounts')
        .select('id, login_id, password, password_encrypted, login_url, public_page_url, user_email')
        .eq('facility_id', facility_id)
        .eq('channel_id', channel.id)
        .eq('account_type', 'shared');

      const { data: accounts } = await accountQuery;
      if (!accounts || accounts.length === 0) {
        results.push({ channel: channel.name, exported: 0, created: 0 });
        continue;
      }

      // 追加フィールド値を取得
      const accountIds = accounts.map(a => a.id);
      const { data: fieldValues } = await serviceSupabase
        .from('account_field_values')
        .select('facility_account_id, field_definition_id, value, field_definition:account_field_definitions!inner(field_key)')
        .in('facility_account_id', accountIds);

      let exportedCount = 0;
      let createdCount = 0;

      for (const account of accounts) {
        // パスワード復号
        const plainPassword = isLinkOnly ? '' : (getPlainPassword(account.password_encrypted, account.password) || '');

        // スプレッドシートの該当行を検索
        const matchRowIndex = rows.findIndex((row, idx) => {
          if (idx < dataStartRow) return false;
          const sheetFacilityId = row[0]?.toString().trim();
          const sheetOTA = row[2]?.toString().trim();

          const facilityMatch =
            sheetFacilityId === facility.code ||
            sheetFacilityId === facility.id ||
            facility.id.startsWith(sheetFacilityId);

          const sheetOTALower = sheetOTA?.toLowerCase();
          const channelMatch =
            sheetOTA === channel.name ||
            sheetOTA === channel.code ||
            sheetOTALower === channel.code?.toLowerCase() ||
            sheetOtaAliases[sheetOTALower] === channel.code;

          // リンカーン: ユーザーメールも一致させる
          if (isLincoln && account.user_email) {
            const sheetEmail = row[11]?.toString().trim();
            return facilityMatch && channelMatch && sheetEmail === account.user_email;
          }

          return facilityMatch && channelMatch;
        });

        // 書き込む行データを構築（A〜L列）
        const accountFieldValues = fieldValues?.filter(fv => fv.facility_account_id === account.id) || [];
        const getExtraField = (fieldKey: string) => {
          const fv = accountFieldValues.find(v =>
            (v.field_definition as unknown as { field_key: string }).field_key === fieldKey
          );
          return fv?.value || '';
        };

        const rowData = [
          facility.code,                                    // A: 施設ID
          facility.name,                                    // B: 施設名
          channelDisplayNames[channel.code] || channel.name, // C: OTA
          account.login_id || '',                           // D: ID
          plainPassword,                                    // E: PW
          account.login_url || '',                          // F: ログインURL
          getExtraField('operator_id'),                     // G: オペレータID(一休)
          getExtraField('hotel_id'),                        // H: 契約コード(ねっぱん)
          getExtraField('facility_id'),                     // I: 施設ID(楽天)
          account.public_page_url || '',                    // J: 公開ページURL
          getExtraField('rurubu_facility_code'),            // K: るるぶ施設コード
          account.user_email || '',                         // L: ユーザーメール
        ];

        if (matchRowIndex >= 0) {
          // 既存行を更新
          const sheetRow = matchRowIndex + 1; // 1-based
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `施設×OTAアカウント!A${sheetRow}:L${sheetRow}`,
            valueInputOption: 'RAW',
            requestBody: { values: [rowData] },
          });
          exportedCount++;
        } else {
          // 新規行を追加
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: '施設×OTAアカウント!A:L',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [rowData] },
          });
          createdCount++;
        }
      }

      results.push({ channel: channel.name, exported: exportedCount, created: createdCount });
    }

    const totalExported = results.reduce((sum, r) => sum + r.exported + r.created, 0);
    const exportedChannels = results.filter(r => r.exported > 0 || r.created > 0);

    return NextResponse.json({
      success: true,
      message: channel_id
        ? (totalExported > 0
            ? `${results[0].channel}をマスタシートに転記しました`
            : `転記するアカウント情報がありません`)
        : `${exportedChannels.length}チャネル（${totalExported}件）をマスタシートに転記しました`,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to export to master sheet', details: message },
      { status: 500 }
    );
  }
}
