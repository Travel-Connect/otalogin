import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

interface Props {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { jobId } = await params;

    // デバイストークンで認証
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _deviceToken = authHeader.slice(7); // TODO: use for device verification
    const supabase = await createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // デバイストークンの検証
    // TODO: device_tokens テーブルで検証
    // const { data: device } = await supabase
    //   .from('device_tokens')
    //   .select('id')
    //   .eq('token', deviceToken)
    //   .single();
    // if (!device) {
    //   return NextResponse.json({ error: 'Invalid device token' }, { status: 401 });
    // }

    // ジョブ情報を取得
    const { data: job, error: jobError } = await supabase
      .from('automation_jobs')
      .select(`
        id,
        facility_id,
        channel_id,
        job_type,
        status,
        channels (
          code,
          login_url
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // アカウント情報を取得
    const { data: account, error: accountError } = await supabase
      .from('facility_accounts')
      .select('login_id, password')
      .eq('facility_id', job.facility_id)
      .eq('channel_id', job.channel_id)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found for this facility/channel' },
        { status: 404 }
      );
    }

    // ジョブを in_progress に更新
    await supabase
      .from('automation_jobs')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', jobId);

    // 注意: パスワードは暗号化されている前提。実際には復号処理が必要
    const channelData = job.channels as unknown as { code: string; login_url: string } | null;
    return NextResponse.json({
      job_id: job.id,
      channel_code: channelData?.code,
      login_url: channelData?.login_url,
      login_id: account.login_id,
      password: account.password, // TODO: 復号処理
      extra_fields: {}, // TODO: 追加フィールドの取得
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get job details', details: message },
      { status: 500 }
    );
  }
}
