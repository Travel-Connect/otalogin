import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { FacilityDashboard } from '@/components/FacilityDashboard';
import { DashboardHeader } from '@/components/DashboardHeader';
import type { DashboardFacility, DashboardChannelInfo, DashboardChannelStatus } from '@/lib/supabase/types';
import { CHANNEL_VISUALS, buildFullUrl } from '@otalogin/shared';

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
      ] = await Promise.all([
        supabase.from('facilities').select('*').order('name'),
        supabase.from('channels').select('*').order('name'),
        supabase.from('facility_accounts').select('id, facility_id, channel_id, login_url, public_url_query, public_page_url').eq('account_type', 'shared').is('user_email', null),
        supabase.from('channel_health_status').select('facility_id, channel_id, status, last_error_code'),
        supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
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
      const dashboardFacilities: DashboardFacility[] = facilities.map((facility) => {
        const facilityChannels: DashboardChannelInfo[] = (channels || []).map((channel) => {
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
          channels: facilityChannels,
        };
      });

      return (
        <div className="min-h-screen bg-gray-50">
          <DashboardHeader isDevelopmentMode={false} />
          <FacilityDashboard facilities={dashboardFacilities} isAdmin={isAdmin} />
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
