import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyDeviceToken } from '@/lib/extension/auth';
import { corsPreflightResponse, addCorsHeaders } from '@/lib/extension/cors';

// CORS プリフライト
export async function OPTIONS() {
  return corsPreflightResponse();
}

/**
 * GET /api/extension/jobs
 * 拡張がポーリングして pending ジョブを取得する
 */
export async function GET(request: NextRequest) {
  try {
    // デバイストークンで認証
    const authResult = await verifyDeviceToken(request);
    if (!authResult.success) {
      return addCorsHeaders(authResult.response);
    }

    const supabase = await createServiceClient();
    if (!supabase) {
      return addCorsHeaders(NextResponse.json({ error: 'Database not configured' }, { status: 500 }));
    }

    // pending ジョブを取得（古い順に最大10件）
    const { data: jobs, error: jobsError } = await supabase
      .from('automation_jobs')
      .select(`
        id,
        facility_id,
        channel_id,
        job_type,
        created_at,
        facilities (
          code,
          name
        ),
        channels (
          code,
          name,
          login_url
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (jobsError) {
      throw jobsError;
    }

    // 施設固有のログインURLを取得するため facility_accounts を参照
    const jobFacilityChannelPairs = (jobs || []).map((j) => ({
      facility_id: j.facility_id,
      channel_id: j.channel_id,
    }));
    const facilityIds = Array.from(new Set(jobFacilityChannelPairs.map((p) => p.facility_id)));

    let accountLoginUrls: Record<string, string> = {};
    if (facilityIds.length > 0) {
      const { data: accounts } = await supabase
        .from('facility_accounts')
        .select('facility_id, channel_id, login_url')
        .in('facility_id', facilityIds)
        .not('login_url', 'is', null);

      if (accounts) {
        for (const acc of accounts) {
          if (acc.login_url) {
            accountLoginUrls[`${acc.facility_id}:${acc.channel_id}`] = acc.login_url;
          }
        }
      }
    }

    // レスポンス整形
    const pendingJobs = (jobs || []).map((job) => {
      const facility = job.facilities as unknown as { code: string; name: string } | null;
      const channel = job.channels as unknown as { code: string; name: string; login_url: string } | null;
      // 施設固有URLがあればそちらを優先
      const accountUrl = accountLoginUrls[`${job.facility_id}:${job.channel_id}`];
      return {
        id: job.id,
        job_type: job.job_type,
        facility_id: job.facility_id,
        facility_code: facility?.code,
        facility_name: facility?.name,
        channel_id: job.channel_id,
        channel_code: channel?.code,
        channel_name: channel?.name,
        login_url: accountUrl || channel?.login_url,
        created_at: job.created_at,
      };
    });

    return addCorsHeaders(NextResponse.json({
      jobs: pendingJobs,
      count: pendingJobs.length,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return addCorsHeaders(NextResponse.json(
      { error: 'Failed to get pending jobs', details: message },
      { status: 500 }
    ));
  }
}
