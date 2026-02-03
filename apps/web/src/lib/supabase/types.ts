// Supabaseデータベース型定義

export interface Database {
  public: {
    Tables: {
      facilities: {
        Row: {
          id: string;
          code: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['facilities']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['facilities']['Insert']>;
      };
      channels: {
        Row: {
          id: string;
          code: string;
          name: string;
          login_url: string;
          created_at: string;
          updated_at: string;
        };
      };
      facility_accounts: {
        Row: {
          id: string;
          facility_id: string;
          channel_id: string;
          account_type: 'shared' | 'override';
          login_id: string;
          password: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['facility_accounts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['facility_accounts']['Insert']>;
      };
      account_field_definitions: {
        Row: {
          id: string;
          channel_id: string;
          field_key: string;
          field_label: string;
          field_type: 'text' | 'password' | 'select';
          is_required: boolean;
          options: string[] | null;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
      };
      account_field_values: {
        Row: {
          id: string;
          facility_account_id: string;
          field_definition_id: string;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['account_field_values']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['account_field_values']['Insert']>;
      };
      channel_health_status: {
        Row: {
          id: string;
          facility_id: string;
          channel_id: string;
          status: 'healthy' | 'unhealthy';
          last_success_at: string | null;
          last_error_at: string | null;
          last_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: 'admin' | 'user';
          created_at: string;
          updated_at: string;
        };
      };
      automation_jobs: {
        Row: {
          id: string;
          facility_id: string;
          channel_id: string;
          job_type: 'manual_login' | 'health_check';
          status: 'pending' | 'in_progress' | 'success' | 'failed' | 'cancelled';
          started_at: string | null;
          completed_at: string | null;
          error_message: string | null;
          created_at: string;
          created_by: string | null;
        };
      };
    };
  };
}

// 施設一覧用の型（ヘルスステータス結合済み）
export interface FacilityWithHealth {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
  health_status: 'healthy' | 'unhealthy' | 'unknown';
}

// 施設詳細用の型
export interface FacilityDetailData {
  id: string;
  code: string;
  name: string;
  channels: ChannelWithAccount[];
}

export interface ChannelWithAccount {
  id: string;
  code: string;
  name: string;
  login_url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  last_checked_at: string | null;
  last_error_message: string | null;
  account: AccountData | null;
  field_definitions: FieldDefinition[];
}

export interface AccountData {
  id: string;
  account_type: 'shared' | 'override';
  login_id: string;
  password: string;
  field_values: FieldValue[];
}

export interface FieldDefinition {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'password' | 'select';
  is_required: boolean;
  options: string[] | null;
  display_order: number;
}

export interface FieldValue {
  field_definition_id: string;
  field_key: string;
  value: string;
}
