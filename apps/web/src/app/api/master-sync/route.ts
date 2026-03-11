import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { encryptPassword } from '@/lib/crypto/credentials';
import { CHANNEL_CONFIGS } from '@otalogin/shared';

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

    if (!facility_id) {
      return NextResponse.json(
        { error: 'facility_id is required' },
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
    // シート形式: A=施設ID | B=施設名 | C=OTA | D=ID | E=PW | F=ログインURL | G=オペレータID(一休) | H=契約コード(ねっぱん) | I=施設ID(楽天) | J=公開ページURL | K=るるぶ施設コード | L=ユーザーメール(リンカーン用)
    const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '施設×OTAアカウント!A:L',
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

    if (!facility) {
      return NextResponse.json(
        { error: '施設が見つかりません' },
        { status: 404 }
      );
    }

    // channel_id が指定されていればそのチャネルのみ、未指定なら全チャネルを同期
    let channels: { id: string; code: string; name: string }[];
    if (channel_id) {
      const { data: channel } = await serviceSupabase
        .from('channels')
        .select('id, code, name')
        .eq('id', channel_id)
        .single();
      if (!channel) {
        return NextResponse.json(
          { error: 'チャネルが見つかりません' },
          { status: 404 }
        );
      }
      channels = [channel];
    } else {
      const { data: allChannels } = await serviceSupabase
        .from('channels')
        .select('id, code, name')
        .order('name');
      channels = allChannels || [];
    }

    // ヘッダー行をスキップし、説明行（2行目）もスキップ
    const dataRows = rows.slice(2);

    // 同一施設の「公式」行からofficial_site_urlを取得・更新
    const officialRow = dataRows.find((row) => {
      const sheetFacilityId = row[0]?.toString().trim();
      const sheetOTA = row[2]?.toString().trim();
      const facilityMatch =
        sheetFacilityId === facility.code ||
        sheetFacilityId === facility.id ||
        facility.id.startsWith(sheetFacilityId);
      return facilityMatch && sheetOTA === '公式';
    });

    if (officialRow) {
      const officialSiteUrl = officialRow[9]?.toString().trim() || null;
      if (officialSiteUrl) {
        await serviceSupabase
          .from('facilities')
          .update({ official_site_url: officialSiteUrl })
          .eq('id', facility_id);
      }
    }

    // スプレッドシートのOTA名 → チャネルコードのエイリアス
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

    // OTP認証チャネル（パスワード不要）
    const otpChannels = ['rurubu'];

    // 追加フィールド列マップ: チャネルコード → { field_key → スプレッドシート列インデックス }
    // G列(6): オペレータID(一休), H列(7): 契約コード(ねっぱん), I列(8): 施設ID(楽天), K列(10): るるぶ施設コード
    const extraFieldMap: Record<string, { field_key: string; column: number }[]> = {
      neppan: [{ field_key: 'hotel_id', column: 7 }],          // H列: 契約コード
      ikyu: [{ field_key: 'operator_id', column: 6 }],         // G列: オペレータID
      rakuten: [{ field_key: 'facility_id', column: 8 }],      // I列: 施設ID（f_no）
      rurubu: [{ field_key: 'rurubu_facility_code', column: 10 }], // K列: るるぶ施設コード
    };

    const results: { channel: string; synced: number; skipped: boolean }[] = [];

    for (const channel of channels) {
      // マッチング関数: 施設ID(col 0) = facility.code, OTA(col 2) = channel.name
      const matchRow = (row: string[]) => {
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

        return facilityMatch && channelMatch;
      };

      // リンカーンはユーザー別クレデンシャル: 同一施設+チャネルの全行を処理
      const isLincoln = channel.code === 'lincoln';
      const targetRows = isLincoln
        ? dataRows.filter(matchRow)
        : dataRows.filter(matchRow).slice(0, 1); // 他チャネルは1行のみ

      if (targetRows.length === 0) {
        results.push({ channel: channel.name, synced: 0, skipped: true });
        continue;
      }

      const isOtpChannel = otpChannels.includes(channel.code);
      const channelConfig = CHANNEL_CONFIGS[channel.code as keyof typeof CHANNEL_CONFIGS];
      const isLinkOnly = channelConfig?.link_only === true;
      let syncedCount = 0;

      // 各行を処理（リンカーンは複数行、他チャネルは1行）
      for (const targetRow of targetRows) {
        // 列インデックス: 0=施設ID, 1=施設名, 2=OTA, 3=ID, 4=PW, 5=ログインURL, ..., 9=公開ページURL(J列), ..., 11=ユーザーメール(L列)
        const loginId = targetRow[3]?.toString().trim();
        const password = targetRow[4]?.toString().trim();
        const loginUrl = targetRow[5]?.toString().trim() || null;
        const publicPageUrl = targetRow[9]?.toString().trim() || null;
        const userEmail = isLincoln ? (targetRow[11]?.toString().trim() || null) : null;

        // 自社OTAチャネルはJ列のURLを公式サイトURLとして扱う
        const officialSiteChannels = ['dynaibe', 'tripla', 'chillnn', 'yoyakupro'];
        if (officialSiteChannels.includes(channel.code) && publicPageUrl) {
          await serviceSupabase
            .from('facilities')
            .update({ official_site_url: publicPageUrl })
            .eq('id', facility_id);
        }

        // リンク専用チャネルはpublic_page_urlのみで保存
        if (isLinkOnly) {
          if (!publicPageUrl) continue;
          const { data: existingAccount } = await serviceSupabase
            .from('facility_accounts')
            .select('id')
            .eq('facility_id', facility_id)
            .eq('channel_id', channel.id)
            .eq('account_type', 'shared')
            .is('user_email', null)
            .maybeSingle();

          if (existingAccount) {
            await serviceSupabase
              .from('facility_accounts')
              .update({
                public_page_url: publicPageUrl,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingAccount.id);
          } else {
            await serviceSupabase
              .from('facility_accounts')
              .insert({
                facility_id,
                channel_id: channel.id,
                account_type: 'shared',
                login_id: channel.code,
                public_page_url: publicPageUrl,
              });
          }
          syncedCount++;
          continue;
        }

        // ログインIDは必須、パスワードはOTPチャネル以外で必須
        if (!loginId) continue;
        if (!password && !isOtpChannel) continue;

        // パスワードを暗号化
        const encryptedPassword = password ? encryptPassword(password) : null;

        // 既存アカウントを検索（部分ユニークインデックス対応）
        let existingQuery = serviceSupabase
          .from('facility_accounts')
          .select('id')
          .eq('facility_id', facility_id)
          .eq('channel_id', channel.id)
          .eq('account_type', 'shared');

        if (userEmail) {
          existingQuery = existingQuery.eq('user_email', userEmail);
        } else {
          existingQuery = existingQuery.is('user_email', null);
        }

        const { data: existingAccount } = await existingQuery.maybeSingle();

        if (existingAccount) {
          // 更新
          await serviceSupabase
            .from('facility_accounts')
            .update({
              login_id: loginId,
              password_encrypted: encryptedPassword,
              password: null,
              login_url: loginUrl,
              public_page_url: publicPageUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAccount.id);
        } else {
          // 新規挿入
          await serviceSupabase
            .from('facility_accounts')
            .insert({
              facility_id,
              channel_id: channel.id,
              account_type: 'shared',
              login_id: loginId,
              password_encrypted: encryptedPassword,
              password: null,
              login_url: loginUrl,
              public_page_url: publicPageUrl,
              user_email: userEmail,
            });
        }

        // アカウントIDを取得（追加フィールド同期用）
        let accountQuery = serviceSupabase
          .from('facility_accounts')
          .select('id')
          .eq('facility_id', facility_id)
          .eq('channel_id', channel.id)
          .eq('account_type', 'shared');

        if (userEmail) {
          accountQuery = accountQuery.eq('user_email', userEmail);
        } else {
          accountQuery = accountQuery.is('user_email', null);
        }

        const { data: savedAccount } = await accountQuery.single();

        if (savedAccount) {
          // 追加フィールド値を同期（マッピングが定義されているチャネルのみ）
          const fieldMappings = extraFieldMap[channel.code];
          if (fieldMappings && fieldMappings.length > 0) {
            const { data: fieldDefs } = await serviceSupabase
              .from('account_field_definitions')
              .select('id, field_key')
              .eq('channel_id', channel.id);

            if (fieldDefs && fieldDefs.length > 0) {
              for (const mapping of fieldMappings) {
                const fieldValue = targetRow[mapping.column]?.toString().trim();
                if (!fieldValue) continue;

                const fieldDef = fieldDefs.find((fd) => fd.field_key === mapping.field_key);
                if (!fieldDef) continue;

                const { data: existingValue } = await serviceSupabase
                  .from('account_field_values')
                  .select('id')
                  .eq('facility_account_id', savedAccount.id)
                  .eq('field_definition_id', fieldDef.id)
                  .maybeSingle();

                if (existingValue) {
                  await serviceSupabase
                    .from('account_field_values')
                    .update({ value: fieldValue })
                    .eq('id', existingValue.id);
                } else {
                  await serviceSupabase
                    .from('account_field_values')
                    .insert({
                      facility_account_id: savedAccount.id,
                      field_definition_id: fieldDef.id,
                      value: fieldValue,
                    });
                }
              }
            }
          }
        }

        syncedCount++;
      }

      results.push({ channel: channel.name, synced: syncedCount, skipped: false });
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
    const syncedChannels = results.filter((r) => r.synced > 0);

    return NextResponse.json({
      success: true,
      message: channel_id
        ? (results[0]?.synced
            ? `${results[0].channel}のアカウント情報を同期しました`
            : `シートに該当データがありません`)
        : `${syncedChannels.length}チャネル（${totalSynced}件）を同期しました`,
      results,
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
