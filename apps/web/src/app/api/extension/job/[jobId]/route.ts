import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyDeviceToken } from '@/lib/extension/auth';
import { getPlainPassword } from '@/lib/crypto/credentials';
import { corsPreflightResponse, addCorsHeaders } from '@/lib/extension/cors';

interface Props {
  params: Promise<{ jobId: string }>;
}

// CORS プリフライト
export async function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { jobId } = await params;

    // デバイストークンで認証（共通関数を使用）
    const authResult = await verifyDeviceToken(request);
    if (!authResult.success) {
      return addCorsHeaders(authResult.response);
    }

    const supabase = await createServiceClient();
    if (!supabase) {
      return addCorsHeaders(NextResponse.json({ error: 'Database not configured' }, { status: 500 }));
    }

    // ジョブ取得とclaim を同時に実行（claim は pending→in_progress の原子更新）
    const [jobResult, claimResult] = await Promise.all([
      supabase
        .from('automation_jobs')
        .select(`
          id,
          facility_id,
          channel_id,
          job_type,
          status,
          created_by,
          channels (
            code,
            login_url
          )
        `)
        .eq('id', jobId)
        .single(),
      supabase
        .from('automation_jobs')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('status', 'pending')
        .select('id')
        .single(),
    ]);

    const { data: job, error: jobError } = jobResult;
    const { data: claimedJob, error: claimError } = claimResult;

    if (jobError || !job) {
      return addCorsHeaders(NextResponse.json({ error: 'Job not found' }, { status: 404 }));
    }

    if (claimError || !claimedJob) {
      return addCorsHeaders(NextResponse.json(
        { error: 'Job already claimed or not in pending status' },
        { status: 409 }
      ));
    }

    // チャネル情報を取得
    const channelData = job.channels as unknown as { code: string; login_url: string } | null;

    // アカウント情報を取得（リンカーン: ユーザー別 → 共有フォールバック、他: 共有）
    type AccountRow = { id: string; login_id: string; password: string; password_encrypted: string | null; login_url: string | null };
    let account: AccountRow | null = null;

    if (channelData?.code === 'lincoln') {
      // リンカーン: ユーザー別 → 共有 → 任意のユーザー別（ヘルスチェック用）の順で検索
      if (job.created_by) {
        // 手動ログイン: ユーザー情報取得と共有クレデンシャルを並列取得
        const [userDataResult, sharedResult] = await Promise.all([
          supabase.auth.admin.getUserById(job.created_by),
          supabase
            .from('facility_accounts')
            .select('id, login_id, password, password_encrypted, login_url')
            .eq('facility_id', job.facility_id)
            .eq('channel_id', job.channel_id)
            .is('user_email', null)
            .maybeSingle(),
        ]);

        const userEmail = userDataResult.data?.user?.email;
        if (userEmail) {
          const { data: userAccount } = await supabase
            .from('facility_accounts')
            .select('id, login_id, password, password_encrypted, login_url')
            .eq('facility_id', job.facility_id)
            .eq('channel_id', job.channel_id)
            .eq('user_email', userEmail)
            .maybeSingle();
          account = userAccount || sharedResult.data;
        } else {
          account = sharedResult.data;
        }
      } else {
        // ヘルスチェック: 共有アカウント → 任意のユーザー別アカウント（最初の1件）
        const { data: sharedAccount } = await supabase
          .from('facility_accounts')
          .select('id, login_id, password, password_encrypted, login_url')
          .eq('facility_id', job.facility_id)
          .eq('channel_id', job.channel_id)
          .is('user_email', null)
          .maybeSingle();

        if (!sharedAccount) {
          // 共有アカウントがなければ任意のユーザー別アカウントを使用
          const { data: anyAccount } = await supabase
            .from('facility_accounts')
            .select('id, login_id, password, password_encrypted, login_url')
            .eq('facility_id', job.facility_id)
            .eq('channel_id', job.channel_id)
            .limit(1)
            .maybeSingle();
          account = anyAccount;
        } else {
          account = sharedAccount;
        }
      }
    } else {
      const { data: sharedAccount } = await supabase
        .from('facility_accounts')
        .select('id, login_id, password, password_encrypted, login_url')
        .eq('facility_id', job.facility_id)
        .eq('channel_id', job.channel_id)
        .is('user_email', null)
        .maybeSingle();
      account = sharedAccount;
    }

    if (!account) {
      // アカウント情報がない場合はジョブを失敗状態に戻す
      await supabase
        .from('automation_jobs')
        .update({
          status: 'failed',
          error_code: 'UNKNOWN',
          error_message: 'Account not found for this facility/channel',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return addCorsHeaders(NextResponse.json(
        { error: 'Account not found for this facility/channel' },
        { status: 404 }
      ));
    }

    // パスワードを復号（password_encrypted 優先、なければ旧 password を使用）
    const plainPassword = getPlainPassword(
      account.password_encrypted,
      account.password
    );

    // OTP認証チャネル（パスワード不要）
    const otpChannels = ['rurubu'];
    const isOtpChannel = otpChannels.includes(channelData?.code || '');

    if (!plainPassword && !isOtpChannel) {
      // パスワードがない場合はジョブを失敗状態に（OTPチャネル以外）
      await supabase
        .from('automation_jobs')
        .update({
          status: 'failed',
          error_code: 'UNKNOWN',
          error_message: 'Password not configured',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return addCorsHeaders(NextResponse.json(
        { error: 'Password not configured for this account' },
        { status: 404 }
      ));
    }

    // 追加フィールドを取得
    const { data: fieldValues } = await supabase
      .from('account_field_values')
      .select(`
        value,
        field_definition:account_field_definitions (
          field_key
        )
      `)
      .eq('facility_account_id', account.id);

    // extra_fields をオブジェクトに変換
    const extraFields: Record<string, string> = {};
    if (fieldValues) {
      for (const fv of fieldValues) {
        const fieldDef = fv.field_definition as unknown as { field_key: string } | null;
        if (fieldDef?.field_key) {
          extraFields[fieldDef.field_key] = fv.value;
        }
      }
    }

    // 施設固有のログインURL（facility_accounts.login_url）があればそちらを優先
    const loginUrl = account.login_url || channelData?.login_url;
    return addCorsHeaders(NextResponse.json({
      job_id: job.id,
      channel_code: channelData?.code,
      login_url: loginUrl,
      login_id: account.login_id,
      password: plainPassword || '', // 復号済みパスワード（OTPチャネルは空文字）
      extra_fields: extraFields,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return addCorsHeaders(NextResponse.json(
      { error: 'Failed to get job details', details: message },
      { status: 500 }
    ));
  }
}
