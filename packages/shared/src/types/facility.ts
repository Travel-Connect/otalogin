export interface Facility {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface FacilityWithStatus extends Facility {
  channels: ChannelStatus[];
}

export interface ChannelStatus {
  channel_id: string;
  channel_code: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  last_checked_at: string | null;
}
