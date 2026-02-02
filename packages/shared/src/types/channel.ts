export interface Channel {
  id: string;
  code: ChannelCode;
  name: string;
  login_url: string;
  created_at: string;
  updated_at: string;
}

export type ChannelCode = 'rakuten' | 'jalan' | 'neppan';

export interface ChannelHealthStatus {
  id: string;
  facility_id: string;
  channel_id: string;
  status: 'healthy' | 'unhealthy';
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}
