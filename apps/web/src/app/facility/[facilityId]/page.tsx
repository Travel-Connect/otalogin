import { redirect, notFound } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { FacilityDetail } from './FacilityDetail';
import type { FacilityDetailData, ChannelWithAccount } from '@/lib/supabase/types';

interface Props {
  params: Promise<{ facilityId: string }>;
}

export default async function FacilityPage({ params }: Props) {
  const { facilityId } = await params;

  // Supabase未設定の場合は開発モードとして動作
  const isDevelopmentMode = !isSupabaseConfigured();

  if (isDevelopmentMode) {
    // 開発モード: ダミーデータ
    const dummyFacility: FacilityDetailData = {
      id: facilityId,
      code: 'hotel-dev',
      name: '開発モード施設',
      channels: [
        {
          id: 'ch-1',
          code: 'rakuten',
          name: '楽天トラベル',
          login_url: 'https://hotel.travel.rakuten.co.jp/extranet/login',
          status: 'unknown',
          last_checked_at: null,
          last_error_message: null,
          account: null,
          field_definitions: [],
        },
      ],
    };
    return <FacilityDetail facility={dummyFacility} isAdmin={true} />;
  }

  const supabase = await createClient();
  if (!supabase) {
    redirect('/login');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 施設情報を取得
  const { data: facility, error: facilityError } = await supabase
    .from('facilities')
    .select('*')
    .eq('id', facilityId)
    .single();

  if (facilityError || !facility) {
    notFound();
  }

  // チャネル一覧を取得
  const { data: channels } = await supabase
    .from('channels')
    .select('*')
    .order('name');

  // 施設のアカウント情報を取得（sharedのみ）
  const { data: accounts } = await supabase
    .from('facility_accounts')
    .select('*')
    .eq('facility_id', facilityId)
    .eq('account_type', 'shared');

  // ヘルスステータスを取得
  const { data: healthStatuses } = await supabase
    .from('channel_health_status')
    .select('*')
    .eq('facility_id', facilityId);

  // フィールド定義を取得
  const { data: fieldDefinitions } = await supabase
    .from('account_field_definitions')
    .select('*')
    .order('display_order');

  // フィールド値を取得
  const accountIds = accounts?.map((a) => a.id) || [];
  const { data: fieldValues } = accountIds.length > 0
    ? await supabase
        .from('account_field_values')
        .select('*')
        .in('facility_account_id', accountIds)
    : { data: [] };

  // ユーザーの権限を確認
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const isAdmin = userRole?.role === 'admin';

  // チャネルごとにデータを整形
  const channelsWithAccount: ChannelWithAccount[] = (channels || []).map((channel) => {
    const account = accounts?.find((a) => a.channel_id === channel.id);
    const healthStatus = healthStatuses?.find((h) => h.channel_id === channel.id);
    const channelFieldDefinitions = fieldDefinitions?.filter(
      (fd) => fd.channel_id === channel.id
    ) || [];

    let accountData = null;
    if (account) {
      const accountFieldValues = fieldValues?.filter(
        (fv) => fv.facility_account_id === account.id
      ) || [];

      accountData = {
        id: account.id,
        account_type: account.account_type as 'shared' | 'override',
        login_id: account.login_id,
        password: account.password,
        field_values: accountFieldValues.map((fv) => {
          const def = channelFieldDefinitions.find((d) => d.id === fv.field_definition_id);
          return {
            field_definition_id: fv.field_definition_id,
            field_key: def?.field_key || '',
            value: fv.value,
          };
        }),
      };
    }

    // 最終チェック日時を計算（成功/失敗の新しい方）
    const lastCheckedAt = healthStatus
      ? healthStatus.last_success_at && healthStatus.last_error_at
        ? new Date(healthStatus.last_success_at) > new Date(healthStatus.last_error_at)
          ? healthStatus.last_success_at
          : healthStatus.last_error_at
        : healthStatus.last_success_at || healthStatus.last_error_at
      : null;

    return {
      id: channel.id,
      code: channel.code,
      name: channel.name,
      login_url: channel.login_url,
      status: healthStatus?.status || 'unknown',
      last_checked_at: lastCheckedAt,
      last_error_message: healthStatus?.last_error_message || null,
      account: accountData,
      field_definitions: channelFieldDefinitions.map((fd) => ({
        id: fd.id,
        field_key: fd.field_key,
        field_label: fd.field_label,
        field_type: fd.field_type as 'text' | 'password' | 'select',
        is_required: fd.is_required,
        options: fd.options as string[] | null,
        display_order: fd.display_order,
      })),
    };
  });

  const facilityData: FacilityDetailData = {
    id: facility.id,
    code: facility.code,
    name: facility.name,
    channels: channelsWithAccount,
  };

  return <FacilityDetail facility={facilityData} isAdmin={isAdmin} />;
}
