import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { FacilityDashboard } from '@/components/FacilityDashboard';
import { DashboardHeader } from '@/components/DashboardHeader';
import type { DashboardFacility, DashboardChannelInfo, DashboardChannelStatus } from '@/lib/supabase/types';
import { CHANNEL_VISUALS, CHANNEL_CODES, buildFullUrl } from '@otalogin/shared';

export default async function HomePage() {
  const isDevelopmentMode = !isSupabaseConfigured();

  if (!isDevelopmentMode) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        redirect('/login');
      }

      // Fetch all data in parallel
      const [
        { data: facilities },
        { data: channels },
        { data: accounts },
        { data: healthStatuses },
        { data: userRole },
        { data: facilityOrder },
      ] = await Promise.all([
        supabase.from('facilities').select('*').order('name'),
        supabase.from('channels').select('*').order('name'),
        supabase.from('facility_accounts').select('id, facility_id, channel_id, login_url, public_url_query, public_page_url, user_email').eq('account_type', 'shared'),
        supabase.from('channel_health_status').select('facility_id, channel_id, status, last_error_code'),
        supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
        supabase.from('user_facility_order').select('facility_id, position').eq('user_id', user.id).order('position'),
      ]);

      const isAdmin = userRole?.role === 'admin';

      if (!facilities || !channels) {
        return (
          <div className="min-h-screen bg-gray-50">
            <DashboardHeader isDevelopmentMode={false} />
            <main className="max-w-[1440px] mx-auto px-6 py-24 text-center text-gray-500">
              データの取得に失敗しました
            </main>
          </div>
        );
      }

      // Build dashboard data
      // Sort channels by CHANNEL_CODES order
      const sortedChannels = [...(channels || [])].sort((a, b) => {
        const aIndex = CHANNEL_CODES.indexOf(a.code as typeof CHANNEL_CODES[number]);
        const bIndex = CHANNEL_CODES.indexOf(b.code as typeof CHANNEL_CODES[number]);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });

      const dashboardFacilities: DashboardFacility[] = facilities.map((facility) => {
        const facilityChannels: DashboardChannelInfo[] = sortedChannels.filter((channel) => {
          return (accounts || []).some(
            (a) => a.facility_id === facility.id && a.channel_id === channel.id
          );
        }).map((channel) => {
          const account = (accounts || []).find(
            (a) => a.facility_id === facility.id && a.channel_id === channel.id
          );
          const hasAccount = !!account;
          const health = (healthStatuses || []).find(
            (h) => h.facility_id === facility.id && h.channel_id === channel.id
          );

          let status: DashboardChannelStatus = 'unregistered';
          if (hasAccount) {
            if (health?.status === 'unhealthy') {
              status = 'error';
            } else if (health?.status === 'healthy') {
              status = 'success';
            } else {
              status = 'success'; // has account but no health check yet
            }
          }

          // Use DB category, fall back to CHANNEL_VISUALS
          const visual = CHANNEL_VISUALS[channel.code as keyof typeof CHANNEL_VISUALS];
          const category = channel.category || visual?.category || 'OTA';

          // Public page URL: prefer direct URL (from spreadsheet J列), fall back to constructed URL
          let publicPageUrl: string | null = account?.public_page_url ?? null;
          if (!publicPageUrl && account?.public_url_query) {
            const baseUrl = account.login_url || channel.login_url;
            publicPageUrl = buildFullUrl(baseUrl, account.public_url_query);
          }

          return {
            channel_id: channel.id,
            channel_code: channel.code,
            channel_name: channel.name,
            category,
            status,
            has_account: hasAccount,
            error_code: health?.last_error_code ?? null,
            public_page_url: publicPageUrl,
            logo_url: channel.logo_url ?? null,
            bg_color: channel.bg_color ?? null,
          };
        });

        return {
          id: facility.id,
          code: facility.code,
          name: facility.name,
          tags: facility.tags || [],
          official_site_url: facility.official_site_url ?? null,
          credential_sheet_url: facility.credential_sheet_url ?? null,
          channels: facilityChannels,
        };
      });

      // ユーザーの並び順を適用（設定がある場合）
      const initialOrder = (facilityOrder || []).map(o => o.facility_id);
      if (initialOrder.length > 0) {
        const orderMap = new Map(initialOrder.map((id, i) => [id, i]));
        dashboardFacilities.sort((a, b) => {
          const posA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const posB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return posA - posB;
        });
      }

      return (
        <div className="min-h-screen bg-gray-50">
          <DashboardHeader
            isDevelopmentMode={false}
            isAdmin={isAdmin}
            facilities={dashboardFacilities.map((f) => ({ id: f.id, name: f.name }))}
          />
          <Suspense><FacilityDashboard facilities={dashboardFacilities} isAdmin={isAdmin} /></Suspense>
        </div>
      );
    }
  }

  // Development mode
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader isDevelopmentMode={true} />
      <main className="max-w-[1440px] mx-auto px-6 py-24 text-center text-gray-500">
        Supabaseが設定されていません（開発モード）
      </main>
    </div>
  );
}
