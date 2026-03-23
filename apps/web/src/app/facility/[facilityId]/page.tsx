import { redirect, notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { createClient, createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { FacilityDetail } from './FacilityDetail';
import { AutoLoginDispatcher } from './AutoLoginDispatcher';
import { resolveChannelCode } from '@otalogin/shared';
import type { FacilityDetailData, ChannelWithAccount } from '@/lib/supabase/types';

// チャネルマスタ・フィールド定義はほぼ変わらないため60秒キャッシュ
const getCachedMasterData = unstable_cache(
  async () => {
    const supabase = await createServiceClient();
    if (!supabase) return { channels: null, fieldDefinitions: null };
    const [channelsResult, fieldDefsResult] = await Promise.all([
      supabase.from('channels').select('*').order('name'),
      supabase.from('account_field_definitions').select('*').order('display_order'),
    ]);
    return {
      channels: channelsResult.data,
      fieldDefinitions: fieldDefsResult.data,
    };
  },
  ['master-channels-fields'],
  { revalidate: 60 }
);

interface Props {
  params: Promise<{ facilityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * ディープリンク対応:
 *   ?channelId=<uuid>       → チャネルUUIDで直接指定（最優先）
 *   ?channel=<code|alias>   → チャネルコード or エイリアスで指定
 *   ?OTA=<alias>            → OTAエイリアスで指定（互換）
 *   ?run=1                  → 自動ログイン実行
 */
function resolveDeepLinkChannel(
  query: { [key: string]: string | string[] | undefined },
  channels: Array<{ id: string; code: string }>
): string | undefined {
  // 1. channelId（UUID直接指定）が最優先
  const channelId = typeof query.channelId === 'string' ? query.channelId.trim() : undefined;
  if (channelId) {
    const found = channels.find(ch => ch.id === channelId);
    if (found) return found.code;
  }

  // 2. channel パラメータ（code or alias）
  const channelParam = typeof query.channel === 'string' ? query.channel.trim() : undefined;
  if (channelParam) {
    // まずUUIDとして探す
    const byId = channels.find(ch => ch.id === channelParam);
    if (byId) return byId.code;
    // code / alias として解決
    const resolved = resolveChannelCode(channelParam);
    if (resolved && channels.some(ch => ch.code === resolved)) return resolved;
  }

  // 3. OTA パラメータ（alias互換）
  const otaParam = typeof query.OTA === 'string' ? query.OTA.trim()
    : typeof query.ota === 'string' ? query.ota.trim()
    : undefined;
  if (otaParam) {
    const resolved = resolveChannelCode(otaParam);
    if (resolved && channels.some(ch => ch.code === resolved)) return resolved;
  }

  return undefined;
}

export default async function FacilityPage({ params, searchParams }: Props) {
  const { facilityId } = await params;
  const query = await searchParams;

  // ディープリンクの run=1 判定
  const autoRun = query.run === '1';
  // open=public: 公開ページを開く
  const openPublic = query.open === 'public';

  // Supabase未設定の場合は開発モードとして動作
  const isDevelopmentMode = !isSupabaseConfigured();

  if (isDevelopmentMode) {
    // 開発モード: ダミーデータ
    const dummyFacility: FacilityDetailData = {
      id: facilityId,
      code: 'hotel-dev',
      name: '開発モード施設',
      official_site_url: null,
      credential_sheet_url: null,
      tags: [],
      channels: [
        {
          id: 'ch-1',
          code: 'rakuten',
          name: '楽天トラベル',
          login_url: 'https://hotel.travel.rakuten.co.jp/extranet/login',
          status: 'unknown',
          last_checked_at: null,
          last_error_code: null,
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
    // 未ログイン時は returnTo 付きでリダイレクト
    const currentPath = `/facility/${facilityId}`;
    const searchParamsStr = new URLSearchParams(
      Object.entries(query).reduce((acc, [k, v]) => {
        if (typeof v === 'string') acc[k] = v;
        return acc;
      }, {} as Record<string, string>)
    ).toString();
    const returnTo = searchParamsStr ? `${currentPath}?${searchParamsStr}` : currentPath;
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  // run=1 ファストパス: チャネルマスタ（キャッシュ）と施設名だけ取得し、即座にディスパッチ
  if (autoRun) {
    const [masterData, { data: facility }] = await Promise.all([
      getCachedMasterData(),
      supabase.from('facilities').select('id, name').eq('id', facilityId).single(),
    ]);

    if (!facility) notFound();

    const channelList = (masterData.channels || []).map(ch => ({ id: ch.id, code: ch.code, name: ch.name }));
    const deepLinkChannel = resolveDeepLinkChannel(query, channelList);

    if (deepLinkChannel) {
      const channel = channelList.find(ch => ch.code === deepLinkChannel);
      if (channel) {
        const fallbackUrl = `/facility/${facilityId}?channel=${deepLinkChannel}`;
        return (
          <AutoLoginDispatcher
            facilityId={facilityId}
            facilityName={facility.name}
            channelId={channel.id}
            channelName={channel.name}
            fallbackUrl={fallbackUrl}
          />
        );
      }
    }
    // チャネル解決できなかった場合はフルページにフォールスルー
  }

  // マスタデータ（キャッシュ済み）と施設固有データを並列取得
  const [
    masterData,
    { data: facility, error: facilityError },
    { data: accounts },
    { data: healthStatuses },
    { data: userRole },
    { data: allFacilitiesTags },
  ] = await Promise.all([
    getCachedMasterData(),
    supabase.from('facilities').select('*').eq('id', facilityId).single(),
    supabase.from('facility_accounts').select('*').eq('facility_id', facilityId).eq('account_type', 'shared').or(`user_email.is.null,user_email.eq.${user.email}`),
    supabase.from('channel_health_status').select('*').eq('facility_id', facilityId),
    supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
    supabase.from('facilities').select('tags'),
  ]);

  const { channels, fieldDefinitions } = masterData;

  if (facilityError || !facility) {
    notFound();
  }

  const isAdmin = userRole?.role === 'admin';

  // サジェスト用: 全施設のタグを集約
  const allTags = Array.from(
    new Set((allFacilitiesTags || []).flatMap((f) => f.tags || []))
  ).sort();

  // フィールド値を取得（accountsに依存）
  const accountIds = accounts?.map((a) => a.id) || [];
  const { data: fieldValues } = accountIds.length > 0
    ? await supabase
        .from('account_field_values')
        .select('*')
        .in('facility_account_id', accountIds)
    : { data: [] };

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
        public_url_query: account.public_url_query as Record<string, string> | null,
        public_page_url: account.public_page_url as string | null,
        admin_url_query: account.admin_url_query as Record<string, string> | null,
        health_check_enabled: account.health_check_enabled ?? true,
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
      last_error_code: healthStatus?.last_error_code || null,
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
    official_site_url: facility.official_site_url ?? null,
    credential_sheet_url: facility.credential_sheet_url ?? null,
    tags: facility.tags ?? [],
    channels: channelsWithAccount,
  };

  // ディープリンクのチャネル解決
  const deepLinkChannel = resolveDeepLinkChannel(
    query,
    channelsWithAccount.map(ch => ({ id: ch.id, code: ch.code }))
  );

  return (
    <FacilityDetail
      facility={facilityData}
      isAdmin={isAdmin}
      allTags={allTags}
      initialChannel={deepLinkChannel}
      autoRun={autoRun && !!deepLinkChannel}
      openPublic={openPublic && !!deepLinkChannel}
    />
  );
}
