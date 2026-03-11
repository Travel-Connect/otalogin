import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Vercel Cron: 5分ごとに実行
 * stuck した in_progress ジョブと、放置された pending health_check を回収
 */

// 閾値設定
const STUCK_IN_PROGRESS_MINUTES = 10; // in_progress が 10分以上 → TIMEOUT
const STALE_PENDING_MINUTES = 30; // pending の health_check が 30分以上 → AGENT_OFFLINE

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

    const now = new Date();
    const results = {
      stuck_in_progress_cleaned: 0,
      stale_pending_cleaned: 0,
      health_status_updated: 0,
    };

    // ========================================
    // 1. Stuck in_progress jobs (TIMEOUT)
    // ========================================
    const stuckThreshold = new Date(
      now.getTime() - STUCK_IN_PROGRESS_MINUTES * 60 * 1000
    ).toISOString();

    const { data: stuckJobs, error: stuckError } = await supabase
      .from('automation_jobs')
      .select('id, facility_id, channel_id')
      .eq('status', 'in_progress')
      .lt('started_at', stuckThreshold);

    if (stuckError) {
      throw stuckError;
    }

    if (stuckJobs && stuckJobs.length > 0) {
      // ジョブを failed に更新
      const stuckJobIds = stuckJobs.map((j) => j.id);
      const { error: updateStuckError } = await supabase
        .from('automation_jobs')
        .update({
          status: 'failed',
          error_code: 'TIMEOUT',
          error_message: `Stuck in_progress for over ${STUCK_IN_PROGRESS_MINUTES} minutes`,
          completed_at: now.toISOString(),
        })
        .in('id', stuckJobIds);

      if (updateStuckError) {
        throw updateStuckError;
      }

      results.stuck_in_progress_cleaned = stuckJobs.length;

      // channel_health_status を更新
      for (const job of stuckJobs) {
        await supabase.from('channel_health_status').upsert(
          {
            facility_id: job.facility_id,
            channel_id: job.channel_id,
            status: 'unhealthy',
            last_error_at: now.toISOString(),
            last_error_code: 'TIMEOUT',
            last_error_message: `Job stuck in_progress (auto-cleanup)`,
            updated_at: now.toISOString(),
          },
          { onConflict: 'facility_id,channel_id' }
        );
        results.health_status_updated++;
      }
    }

    // ========================================
    // 2. Stale pending health_check jobs (AGENT_OFFLINE)
    //    ※ manual_login は対象外（ユーザーが意図的に作成した可能性）
    // ========================================
    const stalePendingThreshold = new Date(
      now.getTime() - STALE_PENDING_MINUTES * 60 * 1000
    ).toISOString();

    const { data: stalePendingJobs, error: stalePendingError } = await supabase
      .from('automation_jobs')
      .select('id, facility_id, channel_id')
      .eq('status', 'pending')
      .eq('job_type', 'health_check') // health_check のみ対象
      .lt('created_at', stalePendingThreshold);

    if (stalePendingError) {
      throw stalePendingError;
    }

    if (stalePendingJobs && stalePendingJobs.length > 0) {
      // ジョブを failed に更新
      const stalePendingJobIds = stalePendingJobs.map((j) => j.id);
      const { error: updateStalePendingError } = await supabase
        .from('automation_jobs')
        .update({
          status: 'failed',
          error_code: 'AGENT_OFFLINE',
          error_message: `No agent picked up job for over ${STALE_PENDING_MINUTES} minutes`,
          completed_at: now.toISOString(),
        })
        .in('id', stalePendingJobIds);

      if (updateStalePendingError) {
        throw updateStalePendingError;
      }

      results.stale_pending_cleaned = stalePendingJobs.length;

      // channel_health_status を更新
      for (const job of stalePendingJobs) {
        await supabase.from('channel_health_status').upsert(
          {
            facility_id: job.facility_id,
            channel_id: job.channel_id,
            status: 'unhealthy',
            last_error_at: now.toISOString(),
            last_error_code: 'AGENT_OFFLINE',
            last_error_message: `No agent available (auto-cleanup)`,
            updated_at: now.toISOString(),
          },
          { onConflict: 'facility_id,channel_id' }
        );
        results.health_status_updated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed',
      ...results,
      thresholds: {
        stuck_in_progress_minutes: STUCK_IN_PROGRESS_MINUTES,
        stale_pending_minutes: STALE_PENDING_MINUTES,
      },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to cleanup stuck jobs', details: message },
      { status: 500 }
    );
  }
}
