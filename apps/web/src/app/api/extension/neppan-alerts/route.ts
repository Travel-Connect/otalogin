import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyDeviceToken } from '@/lib/extension/auth';
import { corsPreflightResponse, addCorsHeaders } from '@/lib/extension/cors';

// CORS プリフライト
export async function OPTIONS() {
  return corsPreflightResponse();
}

/**
 * ねっぱん top.php から抽出したPW経過日数データを受信・保存
 * 施設特定: 直近のねっぱんジョブ（completed/success）から facility_id を取得
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyDeviceToken(request);
    if (!authResult.success) {
      return addCorsHeaders(authResult.response);
    }

    const body = await request.json();
    const { hostname, alerts } = body as {
      hostname: string;
      alerts: Array<{ site_name: string; elapsed_text: string }>;
    };

    if (!hostname || !alerts || !Array.isArray(alerts)) {
      return addCorsHeaders(
        NextResponse.json({ error: 'Invalid request' }, { status: 400 })
      );
    }

    const supabase = await createServiceClient();
    if (!supabase) {
      return addCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 })
      );
    }

    // ねっぱんチャネルを取得
    const { data: neppanChannel } = await supabase
      .from('channels')
      .select('id')
      .eq('code', 'neppan')
      .single();

    if (!neppanChannel) {
      return addCorsHeaders(
        NextResponse.json({ error: 'Neppan channel not found' }, { status: 404 })
      );
    }

    // 直近10分以内に完了したねっぱんジョブから施設を特定
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentJob } = await supabase
      .from('automation_jobs')
      .select('facility_id')
      .eq('channel_id', neppanChannel.id)
      .in('status', ['success', 'in_progress'])
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentJob) {
      // フォールバック: ねっぱんアカウントを持つ施設が1つだけならそれを使う
      const { data: neppanAccounts } = await supabase
        .from('facility_accounts')
        .select('facility_id')
        .eq('channel_id', neppanChannel.id)
        .is('user_email', null);

      const uniqueFacilities = Array.from(new Set((neppanAccounts || []).map(a => a.facility_id)));
      if (uniqueFacilities.length !== 1) {
        return addCorsHeaders(
          NextResponse.json({
            error: 'Could not determine facility',
            hostname,
          }, { status: 404 })
        );
      }

      // 1施設のみの場合はそれを使用
      await upsertAlerts(supabase, uniqueFacilities[0], alerts);

      return addCorsHeaders(
        NextResponse.json({
          success: true,
          facility_id: uniqueFacilities[0],
          alerts_saved: alerts.length,
          source: 'single_facility_fallback',
        })
      );
    }

    await upsertAlerts(supabase, recentJob.facility_id, alerts);

    return addCorsHeaders(
      NextResponse.json({
        success: true,
        facility_id: recentJob.facility_id,
        alerts_saved: alerts.length,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return addCorsHeaders(
      NextResponse.json(
        { error: 'Failed to save neppan alerts', details: message },
        { status: 500 }
      )
    );
  }
}

/**
 * PW経過日数データをupsert（施設×サイト名で一意）
 */
async function upsertAlerts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  facilityId: string,
  alerts: Array<{ site_name: string; elapsed_text: string }>
) {
  if (!supabase) return;

  const now = new Date().toISOString();

  for (const alert of alerts) {
    await supabase
      .from('neppan_password_alerts')
      .upsert(
        {
          facility_id: facilityId,
          site_name: alert.site_name,
          elapsed_text: alert.elapsed_text,
          fetched_at: now,
        },
        { onConflict: 'facility_id,site_name' }
      );
  }

  // TC Portal のお知らせに送信
  await notifyTcPortal(supabase, facilityId, alerts);
}

/**
 * TC Portal のお知らせ Webhook にアラートを送信
 * 施設ごとに1つのお知らせとしてまとめる
 */
async function notifyTcPortal(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  facilityId: string,
  alerts: Array<{ site_name: string; elapsed_text: string }>
) {
  const webhookUrl = process.env.TC_PORTAL_WEBHOOK_URL;
  const webhookKey = process.env.TC_PORTAL_WEBHOOK_KEY;

  if (!webhookUrl || !webhookKey) {
    console.log('[neppan-alerts] TC Portal webhook not configured, skipping');
    return;
  }

  try {
    // 施設名を取得
    let facilityName = '不明な施設';
    if (supabase) {
      const { data: facility } = await supabase
        .from('facilities')
        .select('name')
        .eq('id', facilityId)
        .single();
      if (facility) {
        facilityName = facility.name;
      }
    }

    const title = `⚠ ねっぱん PW変更アラート: ${facilityName}`;
    const body = alerts
      .map((a) => `・${a.site_name}: ${a.elapsed_text}`)
      .join('\n');
    const today = new Date().toISOString().slice(0, 10);
    const externalRef = `neppan-pw:${facilityId}:${today}`;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Key': webhookKey,
      },
      body: JSON.stringify({ title, body, external_ref: externalRef }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[neppan-alerts] TC Portal webhook failed: ${res.status} ${text}`);
    } else {
      const result = await res.json();
      console.log(`[neppan-alerts] TC Portal announcement ${result.action}: ${result.id}`);
    }
  } catch (err) {
    console.error('[neppan-alerts] TC Portal webhook error:', err);
  }
}

/**
 * GET: 外部ツール向け - ねっぱんPW経過日数データ取得
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const facilityId = request.nextUrl.searchParams.get('facility_id');

    let query = supabase
      .from('neppan_password_alerts')
      .select(`
        facility_id,
        site_name,
        elapsed_text,
        fetched_at,
        facilities (
          code,
          name
        )
      `)
      .order('fetched_at', { ascending: false });

    if (facilityId) {
      query = query.eq('facility_id', facilityId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ alerts: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch neppan alerts', details: message },
      { status: 500 }
    );
  }
}
