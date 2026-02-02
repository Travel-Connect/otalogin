export interface FacilityAccount {
  id: string;
  facility_id: string;
  channel_id: string;
  account_type: AccountType;
  login_id: string;
  password: string; // 暗号化された状態で保存
  created_at: string;
  updated_at: string;
}

export type AccountType = 'shared' | 'override';

export interface AccountFieldDefinition {
  id: string;
  channel_id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'password' | 'select';
  is_required: boolean;
  options: string[] | null; // select の場合の選択肢
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountFieldValue {
  id: string;
  facility_account_id: string;
  field_definition_id: string;
  value: string; // 暗号化が必要な場合は暗号化された状態
  created_at: string;
  updated_at: string;
}

// UI用の型（パスワードマスク状態を含む）
export interface AccountDisplay {
  id: string;
  facility_id: string;
  channel_id: string;
  account_type: AccountType;
  login_id: string;
  password_masked: string; // 常に "****"
  extra_fields: ExtraFieldDisplay[];
}

export interface ExtraFieldDisplay {
  field_key: string;
  field_label: string;
  value: string;
  value_masked?: string; // password型の場合
  field_type: 'text' | 'password' | 'select';
}
