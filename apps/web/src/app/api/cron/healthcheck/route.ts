import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Vercel Cron: 毎日 20:00 UTC (= 05:00 JST)
// vercel.json で設定

export async function GET(request: NextRequest) {
  // CRON_SECRET で認証
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();

    // shared アカウントを持つ全ての facility × channel を取得
    const { data: accounts, error: accountsError } = await supabase
      .from('facility_accounts')
      .select('facility_id, channel_id')
      .eq('account_type', 'shared');

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: 'No shared accounts found',
        jobs_created: 0,
      });
    }

    // 各アカウントに対して health_check ジョブを作成
    const jobs = accounts.map((account) => ({
      facility_id: account.facility_id,
      channel_id: account.channel_id,
      job_type: 'health_check',
      status: 'pending',
      created_by: 'system',
    }));

    const { data: createdJobs, error: jobsError } = await supabase
      .from('automation_jobs')
      .insert(jobs)
      .select('id');

    if (jobsError) {
      throw jobsError;
    }

    return NextResponse.json({
      message: 'Health check jobs created',
      jobs_created: createdJobs?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // エラーメッセージから機密情報を除外
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create health check jobs', details: message },
      { status: 500 }
    );
  }
}
