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
