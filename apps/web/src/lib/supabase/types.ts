// Supabaseデータベース型定義

// ErrorCode 型（shared パッケージと同期）
export type ErrorCodeType =
  | 'AUTH_FAILED'
  | 'UI_CHANGED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'AGENT_OFFLINE'
  | 'UNKNOWN';

export interface Database {
  public: {
    Tables: {
      facilities: {
        Row: {
          id: string;
          code: string;
          name: string;
          tags: string[];
          official_site_url: string | null;
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
          category: 'OTA' | 'Systems';
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
          login_url: string | null;
          user_email: string | null;
          public_url_query: Record<string, string> | null;
          public_page_url: string | null;
          admin_url_query: Record<string, string> | null;
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
          last_error_code: ErrorCodeType | null;
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
          error_code: ErrorCodeType | null;
          error_message: string | null;
          created_at: string;
          created_by: string | null;
        };
      };
      neppan_password_alerts: {
        Row: {
          id: string;
          facility_id: string;
          site_name: string;
          elapsed_text: string;
          fetched_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['neppan_password_alerts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['neppan_password_alerts']['Insert']>;
      };
      user_shortcuts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          facility_id: string;
          channel_id: string;
          action_type: 'login' | 'public';
          slot_no: number | null;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_shortcuts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_shortcuts']['Insert']>;
      };
    };
  };
}

// 施設一覧用の型（ヘルスステータス結合済み）
export interface FacilityWithHealth {
  id: string;
  code: string;
  name: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  health_status: 'healthy' | 'unhealthy' | 'unknown';
}

// ダッシュボード用: チャネルごとのステータス
export type DashboardChannelStatus = 'success' | 'error' | 'running' | 'unregistered';

export interface DashboardChannelInfo {
  channel_id: string;
  channel_code: string;
  channel_name: string;
  category: 'OTA' | 'Systems';
  status: DashboardChannelStatus;
  has_account: boolean;
  error_code: ErrorCodeType | null;
  /** 公開ページURL（login_url + public_url_query で構築済み） */
  public_page_url: string | null;
  /** チャネルロゴURL（Supabase Storageにアップロード済み） */
  logo_url: string | null;
  /** カスタム背景色（未設定時はCHANNEL_VISUALSのデフォルト色を使用） */
  bg_color: string | null;
}

export interface DashboardFacility {
  id: string;
  code: string;
  name: string;
  tags: string[];
  official_site_url: string | null;
  channels: DashboardChannelInfo[];
}

// 施設詳細用の型
export interface FacilityDetailData {
  id: string;
  code: string;
  name: string;
  official_site_url: string | null;
  channels: ChannelWithAccount[];
}

export interface ChannelWithAccount {
  id: string;
  code: string;
  name: string;
  login_url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  last_checked_at: string | null;
  last_error_code: ErrorCodeType | null;
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
  public_url_query: Record<string, string> | null;
  public_page_url: string | null;
  admin_url_query: Record<string, string> | null;
  health_check_enabled: boolean;
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

// ショートカット定義（JOIN済み）
export interface ShortcutWithDetails {
  id: string;
  user_id: string;
  name: string;
  facility_id: string;
  channel_id: string;
  action_type: 'login' | 'public';
  slot_no: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  facility_name: string;
  facility_code: string;
  channel_name: string;
  channel_code: string;
}
