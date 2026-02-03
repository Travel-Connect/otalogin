'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { StatusLamp } from './StatusLamp';
import { FacilityMenu } from './FacilityMenu';
import type { FacilityWithHealth } from '@/lib/supabase/types';

export function FacilityList() {
  const [facilities, setFacilities] = useState<FacilityWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFacilities = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        // 施設一覧を取得
        const { data: facilitiesData, error: facilitiesError } = await supabase
          .from('facilities')
          .select('*')
          .order('name');

        if (facilitiesError) {
          throw facilitiesError;
        }

        if (!facilitiesData || facilitiesData.length === 0) {
          setFacilities([]);
          setLoading(false);
          return;
        }

        // 各施設のヘルスステータスを取得
        const { data: healthData, error: healthError } = await supabase
          .from('channel_health_status')
          .select('facility_id, status');

        if (healthError) {
          console.error('Health status fetch error:', healthError);
        }

        // 施設ごとの全体ステータスを計算
        const facilitiesWithHealth: FacilityWithHealth[] = facilitiesData.map((facility) => {
          const facilityHealthRecords = healthData?.filter(
            (h) => h.facility_id === facility.id
          ) || [];

          let health_status: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';

          if (facilityHealthRecords.length > 0) {
            const hasUnhealthy = facilityHealthRecords.some((h) => h.status === 'unhealthy');
            const allHealthy = facilityHealthRecords.every((h) => h.status === 'healthy');

            if (hasUnhealthy) {
              health_status = 'unhealthy';
            } else if (allHealthy) {
              health_status = 'healthy';
            }
          }

          return {
            ...facility,
            health_status,
          };
        });

        setFacilities(facilitiesWithHealth);
      } catch (err) {
        console.error('Fetch facilities error:', err);
        setError('施設情報の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchFacilities();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-500">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-primary-600 hover:underline"
        >
          再読み込み
        </button>
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

function FacilityCard({ facility }: { facility: FacilityWithHealth }) {
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
