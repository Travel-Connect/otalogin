'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { StatusLamp } from './StatusLamp';
import { FacilityMenu } from './FacilityMenu';

interface FacilityWithStatus {
  id: string;
  code: string;
  name: string;
  health_status: 'healthy' | 'unhealthy' | 'unknown';
}

// ダミーデータ（初期段階）
const DUMMY_FACILITIES: FacilityWithStatus[] = [
  { id: '1', code: 'hotel-001', name: 'サンプルホテル東京', health_status: 'healthy' },
  { id: '2', code: 'hotel-002', name: 'サンプル旅館京都', health_status: 'unhealthy' },
  { id: '3', code: 'hotel-003', name: 'サンプルリゾート沖縄', health_status: 'unknown' },
];

export function FacilityList() {
  const [facilities, setFacilities] = useState<FacilityWithStatus[]>(DUMMY_FACILITIES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // TODO: Supabaseから施設一覧を取得
    // const fetchFacilities = async () => {
    //   setLoading(true);
    //   const supabase = createClient();
    //   const { data, error } = await supabase
    //     .from('facilities')
    //     .select('*');
    //   if (data) setFacilities(data);
    //   setLoading(false);
    // };
    // fetchFacilities();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (facilities.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        施設が登録されていません
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {facilities.map((facility) => (
        <FacilityCard key={facility.id} facility={facility} />
      ))}
    </div>
  );
}

function FacilityCard({ facility }: { facility: FacilityWithStatus }) {
  return (
    <div className="card relative hover:shadow-lg transition-shadow">
      {/* 状態ランプ */}
      <div className="absolute top-4 left-4">
        <StatusLamp status={facility.health_status} />
      </div>

      {/* 歯車メニュー */}
      <div className="absolute top-4 right-4">
        <FacilityMenu facilityId={facility.id} />
      </div>

      <Link href={`/facility/${facility.id}`} className="block pt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {facility.name}
        </h3>
        <p className="text-sm text-gray-500">{facility.code}</p>
      </Link>
    </div>
  );
}
