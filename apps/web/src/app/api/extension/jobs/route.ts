import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/extension/jobs
 * 拡張がポーリングして pending ジョブを取得する
 */
export async function GET(request: NextRequest) {
  try {
    // デバイストークンで認証
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deviceToken = authHeader.slice(7);
    const supabase = await createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // デバイストークンの検証
    const { data: device, error: deviceError } = await supabase
      .from('device_tokens')
      .select('id')
      .eq('token', deviceToken)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ error: 'Invalid device token' }, { status: 401 });
    }

    // last_used_at を更新
    await supabase
      .from('device_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', device.id);

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

    // レスポンス整形
    const pendingJobs = (jobs || []).map((job) => {
      const facility = job.facilities as unknown as { code: string; name: string } | null;
      const channel = job.channels as unknown as { code: string; name: string; login_url: string } | null;
      return {
        id: job.id,
        job_type: job.job_type,
        facility_id: job.facility_id,
        facility_code: facility?.code,
        facility_name: facility?.name,
        channel_id: job.channel_id,
        channel_code: channel?.code,
        channel_name: channel?.name,
        login_url: channel?.login_url,
        created_at: job.created_at,
      };
    });

    return NextResponse.json({
      jobs: pendingJobs,
      count: pendingJobs.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get pending jobs', details: message },
      { status: 500 }
    );
  }
}
