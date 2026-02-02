import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CreateJobSchema } from '@otalogin/shared';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // ユーザー認証確認
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateJobSchema.safeParse({
      ...body,
      job_type: 'manual_login',
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { facility_id, channel_id } = parsed.data;

    // ジョブを作成
    const { data: job, error } = await supabase
      .from('automation_jobs')
      .insert({
        facility_id,
        channel_id,
        job_type: 'manual_login',
        status: 'pending',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
      message: 'Login job created',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create job', details: message },
      { status: 500 }
    );
  }
}
