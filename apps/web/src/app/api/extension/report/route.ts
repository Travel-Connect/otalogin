import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { JobResultSchema } from '@otalogin/shared';
import { verifyDeviceToken } from '@/lib/extension/auth';
import { corsPreflightResponse, addCorsHeaders } from '@/lib/extension/cors';

// CORS プリフライト
export async function OPTIONS() {
  return corsPreflightResponse();
}

export async function POST(request: NextRequest) {
  try {
    // デバイストークンで認証（共通関数を使用）
    const authResult = await verifyDeviceToken(request);
    if (!authResult.success) {
      return addCorsHeaders(authResult.response);
    }

    const body = await request.json();
    const parsed = JobResultSchema.safeParse(body);

    if (!parsed.success) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      ));
    }

    const { job_id, status, error_code, error_message } = parsed.data;

    const supabase = await createServiceClient();
    if (!supabase) {
      return addCorsHeaders(NextResponse.json({ error: 'Database not configured' }, { status: 500 }));
    }

    // ジョブのステータスを更新（error_code も保存）
    const { error: updateError } = await supabase
      .from('automation_jobs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        error_code: error_code || null,
        error_message: error_message || null,
      })
      .eq('id', job_id);

    if (updateError) {
      throw updateError;
    }

    // ジョブ情報を取得してヘルスステータスを更新
    const { data: job } = await supabase
      .from('automation_jobs')
      .select('facility_id, channel_id, job_type')
      .eq('id', job_id)
      .single();

    if (job) {
      // channel_health_status を upsert（last_error_code も保存）
      await supabase.from('channel_health_status').upsert(
        {
          facility_id: job.facility_id,
          channel_id: job.channel_id,
          status: status === 'success' ? 'healthy' : 'unhealthy',
          last_success_at: status === 'success' ? new Date().toISOString() : undefined,
          last_error_at: status === 'failed' ? new Date().toISOString() : undefined,
          last_error_code: status === 'failed' ? (error_code || null) : null,
          last_error_message: error_message || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'facility_id,channel_id',
        }
      );
    }

    return addCorsHeaders(NextResponse.json({
      success: true,
      message: 'Job result reported',
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return addCorsHeaders(NextResponse.json(
      { error: 'Failed to report job result', details: message },
      { status: 500 }
    ));
  }
}
