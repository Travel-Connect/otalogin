'use client';

import { Suspense } from 'react';
import { FacilityDashboard } from '@/components/FacilityDashboard';
import { DashboardHeader } from '@/components/DashboardHeader';
import type { DashboardFacility } from '@/lib/supabase/types';

/**
 * E2Eテスト用のモックダッシュボード
 * 実データなしでダッシュボードコンポーネントをテスト可能
 */

const MOCK_FACILITIES: DashboardFacility[] = [
  {
    id: 'f1',
    code: 'OKINAWA',
    name: 'テストホテル沖縄',
    tags: ['南部', 'リゾート'],
    official_site_url: 'https://example.com/okinawa',
    channels: [
      { channel_id: 'ch1', channel_code: 'neppan', channel_name: 'ねっぱん', category: 'Systems', status: 'success', has_account: true, error_code: null, public_page_url: null, logo_url: null, bg_color: null },
      { channel_id: 'ch2', channel_code: 'lincoln', channel_name: 'リンカーン', category: 'Systems', status: 'unregistered', has_account: false, error_code: null, public_page_url: null, logo_url: null, bg_color: null },
      { channel_id: 'ch3', channel_code: 'jalan', channel_name: 'じゃらん', category: 'OTA', status: 'success', has_account: true, error_code: null, public_page_url: 'https://www.jalan.net/yad300000/', logo_url: null, bg_color: null },
      { channel_id: 'ch4', channel_code: 'rakuten', channel_name: '楽天トラベル', category: 'OTA', status: 'success', has_account: true, error_code: null, public_page_url: 'https://travel.rakuten.co.jp/HOTEL/100000/', logo_url: null, bg_color: null },
      { channel_id: 'ch5', channel_code: 'ikyu', channel_name: '一休', category: 'OTA', status: 'error', has_account: true, error_code: 'AUTH_FAILED', public_page_url: 'https://www.ikyu.com/00001234/', logo_url: null, bg_color: null },
      { channel_id: 'ch6', channel_code: 'rurubu', channel_name: 'るるぶ', category: 'OTA', status: 'success', has_account: true, error_code: null, public_page_url: null, logo_url: null, bg_color: null },
      { channel_id: 'ch7', channel_code: 'skyticket', channel_name: 'スカイチケット', category: 'OTA', status: 'unregistered', has_account: false, error_code: null, public_page_url: null, logo_url: null, bg_color: null },
    ],
  },
  {
    id: 'f2',
    code: 'NAHA',
    name: 'テストホテル那覇',
    tags: ['南部', '都市'],
    official_site_url: 'https://example.com/naha',
    channels: [
      { channel_id: 'ch1', channel_code: 'neppan', channel_name: 'ねっぱん', category: 'Systems', status: 'success', has_account: true, error_code: null, public_page_url: null, logo_url: null, bg_color: null },
      { channel_id: 'ch3', channel_code: 'jalan', channel_name: 'じゃらん', category: 'OTA', status: 'success', has_account: true, error_code: null, public_page_url: 'https://www.jalan.net/yad400000/', logo_url: null, bg_color: null },
      { channel_id: 'ch4', channel_code: 'rakuten', channel_name: '楽天トラベル', category: 'OTA', status: 'unregistered', has_account: false, error_code: null, public_page_url: null, logo_url: null, bg_color: null },
    ],
  },
  {
    id: 'f3',
    code: 'EAST',
    name: 'テストホテル東部',
    tags: ['東部'],
    official_site_url: null,
    channels: [
      { channel_id: 'ch1', channel_code: 'neppan', channel_name: 'ねっぱん', category: 'Systems', status: 'error', has_account: true, error_code: 'TIMEOUT', public_page_url: null, logo_url: null, bg_color: null },
      { channel_id: 'ch3', channel_code: 'jalan', channel_name: 'じゃらん', category: 'OTA', status: 'success', has_account: true, error_code: null, public_page_url: 'https://www.jalan.net/yad500000/', logo_url: null, bg_color: null },
    ],
  },
];

export default function MockDashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50" data-testid="mock-dashboard">
      <DashboardHeader isDevelopmentMode={true} />
      <Suspense><FacilityDashboard facilities={MOCK_FACILITIES} /></Suspense>
    </div>
  );
}
