import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { CHANNEL_CONFIGS } from '@otalogin/shared';

// Vercel Cron: 毎日 20:00 UTC (= 05:00 JST)
// vercel.json で設定

// リンクオンリーのチャネルコードを取得（ログイン自動化が不要なOTA）
const LINK_ONLY_CODES = Object.entries(CHANNEL_CONFIGS)
  .filter(([, config]) => config.link_only)
  .map(([code]) => code);

export async function GET(request: NextRequest) {
  // CRON_SECRET で認証（開発時はスキップ可能）
  const authHeader = request.headers.get('authorization');
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // リンクオンリーのチャネルIDを取得（ヘルスチェック不要）
    let linkOnlyChannelIds: string[] = [];
    if (LINK_ONLY_CODES.length > 0) {
      const { data: linkOnlyChannels } = await supabase
        .from('channels')
        .select('id')
        .in('code', LINK_ONLY_CODES);
      linkOnlyChannelIds = (linkOnlyChannels || []).map((c) => c.id);
    }

    // shared アカウントを持つ全ての facility × channel を取得（リンクオンリー除外）
    let query = supabase
      .from('facility_accounts')
      .select('facility_id, channel_id')
      .eq('account_type', 'shared');

    if (linkOnlyChannelIds.length > 0) {
      // not in で link_only チャネルを除外
      query = query.not('channel_id', 'in', `(${linkOnlyChannelIds.join(',')})`);
    }

    const { data: accounts, error: accountsError } = await query;

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        message: 'No shared accounts found',
        jobs_created: 0,
      });
    }

    // 今日の開始時刻（UTC）を計算
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // 今日すでに作成済みの health_check ジョブを取得（重複防止）
    const { data: existingJobs } = await supabase
      .from('automation_jobs')
      .select('facility_id, channel_id')
      .eq('job_type', 'health_check')
      .gte('created_at', todayIso);

    const existingSet = new Set(
      (existingJobs || []).map(
        (j) => `${j.facility_id}-${j.channel_id}`
      )
    );

    // 重複を除外してジョブを作成
    const newJobs = accounts
      .filter(
        (account) =>
          !existingSet.has(`${account.facility_id}-${account.channel_id}`)
      )
      .map((account) => ({
        facility_id: account.facility_id,
        channel_id: account.channel_id,
        job_type: 'health_check' as const,
        status: 'pending' as const,
      }));

    if (newJobs.length === 0) {
      return NextResponse.json({
        message: 'All health check jobs already exist for today',
        jobs_created: 0,
        skipped: accounts.length,
      });
    }

    const { data: createdJobs, error: jobsError } = await supabase
      .from('automation_jobs')
      .insert(newJobs)
      .select('id');

    if (jobsError) {
      throw jobsError;
    }

    return NextResponse.json({
      message: 'Health check jobs created',
      jobs_created: createdJobs?.length || 0,
      skipped: accounts.length - newJobs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create health check jobs', details: message },
      { status: 500 }
    );
  }
}
