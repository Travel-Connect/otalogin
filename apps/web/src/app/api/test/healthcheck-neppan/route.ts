import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// テスト用: ねっぱんのみのヘルスチェックジョブを手動作成
// 開発環境のみ使用可能
// GET /api/test/healthcheck-neppan?facility=starhouse
//   facility=starhouse → スターハウスのみ
//   facility=all → ねっぱん登録済み全施設
//   省略時 → 全施設

export async function GET(request: NextRequest) {
  // 本番では無効化
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_ENDPOINTS) {
    return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 });
  }

  const facilityFilter = request.nextUrl.searchParams.get('facility');

  try {
    const supabase = await createServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // ねっぱんのチャネルIDを取得
    const { data: neppanChannel, error: channelError } = await supabase
      .from('channels')
      .select('id, name')
      .eq('code', 'neppan')
      .single();

    if (channelError || !neppanChannel) {
      return NextResponse.json({ error: 'Neppan channel not found', details: channelError }, { status: 404 });
    }

    // ねっぱんの shared アカウントを持つ施設を取得
    const accountsQuery = supabase
      .from('facility_accounts')
      .select('facility_id, facilities!inner(id, name)')
      .eq('channel_id', neppanChannel.id)
      .eq('account_type', 'shared');

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError) {
      return NextResponse.json({ error: 'Failed to fetch accounts', details: accountsError }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No neppan accounts found' }, { status: 404 });
    }

    // 施設フィルタ
    let filteredAccounts = accounts;
    if (facilityFilter && facilityFilter !== 'all') {
      filteredAccounts = accounts.filter((a) => {
        const facility = a.facilities as unknown as { id: string; name: string };
        return facility.name.includes(facilityFilter) ||
               facility.name.toLowerCase().includes(facilityFilter.toLowerCase());
      });

      if (filteredAccounts.length === 0) {
        const availableNames = accounts.map((a) => (a.facilities as unknown as { name: string }).name);
        return NextResponse.json({
          error: `No facility matching "${facilityFilter}"`,
          available: availableNames,
        }, { status: 404 });
      }
    }

    // ヘルスチェックジョブを作成
    const newJobs = filteredAccounts.map((account) => ({
      facility_id: account.facility_id,
      channel_id: neppanChannel.id,
      job_type: 'health_check' as const,
      status: 'pending' as const,
    }));

    const { data: createdJobs, error: jobsError } = await supabase
      .from('automation_jobs')
      .insert(newJobs)
      .select('id, facility_id');

    if (jobsError) {
      return NextResponse.json({ error: 'Failed to create jobs', details: jobsError }, { status: 500 });
    }

    const result = {
      message: 'Neppan health check test jobs created',
      channel: neppanChannel.name,
      jobs: (createdJobs || []).map((job) => {
        const account = filteredAccounts.find((a) => a.facility_id === job.facility_id);
        const facility = account?.facilities as unknown as { id: string; name: string };
        return {
          job_id: job.id,
          facility: facility?.name || job.facility_id,
        };
      }),
      jobs_created: createdJobs?.length || 0,
      timestamp: new Date().toISOString(),
      note: '拡張機能がジョブを検出してねっぱんにログインします。ログイン後、top.phpのパスワードアラートが自動取得されます。',
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Test failed', details: message }, { status: 500 });
  }
}
