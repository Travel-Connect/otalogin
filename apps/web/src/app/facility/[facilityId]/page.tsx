import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FacilityDetail } from './FacilityDetail';

interface Props {
  params: Promise<{ facilityId: string }>;
}

// ダミーデータ（初期段階）
const DUMMY_FACILITY = {
  id: '1',
  code: 'hotel-001',
  name: 'サンプルホテル東京',
  channels: [
    {
      id: 'ch-1',
      code: 'rakuten',
      name: '楽天トラベル',
      status: 'healthy' as const,
      account: {
        login_id: 'sample_user',
        has_password: true,
      },
    },
    {
      id: 'ch-2',
      code: 'jalan',
      name: 'じゃらん',
      status: 'unhealthy' as const,
      account: {
        login_id: 'jalan_user',
        has_password: true,
      },
    },
    {
      id: 'ch-3',
      code: 'neppan',
      name: 'ねっぱん',
      status: 'unknown' as const,
      account: null,
    },
  ],
};

export default async function FacilityPage({ params }: Props) {
  const { facilityId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // TODO: Supabaseから施設情報を取得
  // const { data: facility } = await supabase
  //   .from('facilities')
  //   .select('*, facility_accounts(*), channel_health_status(*)')
  //   .eq('id', facilityId)
  //   .single();

  // if (!facility) {
  //   notFound();
  // }

  // ダミーデータを使用
  const facility = { ...DUMMY_FACILITY, id: facilityId };

  return <FacilityDetail facility={facility} />;
}
