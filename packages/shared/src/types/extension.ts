// ポータル → 拡張へのメッセージ
export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload: unknown;
}

export type ExtensionMessageType =
  | 'DISPATCH_LOGIN' // ログイン実行依頼
  | 'PING' // 疎通確認
  | 'GET_STATUS' // 状態取得
  | 'SYNC_URL_QUERY'; // アクティブタブのURLクエリを同期

export interface DispatchLoginPayload {
  job_id: string;
  channel_code: string;
  facility_id: string;
  /** true の場合、新規タブを開かず送信元タブ自体をOTAサイトに遷移させる */
  use_same_tab?: boolean;
}

export interface SyncUrlQueryPayload {
  /** 同期対象: 公開ページ or 管理画面 */
  kind: 'public' | 'admin';
  /** ドメインチェック用の許可ドメインリスト */
  allowed_domains: string[];
}

// 拡張 → ポータルへの応答
export interface ExtensionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

// ペアリング関連
export interface PairingRequest {
  pairing_code: string;
  device_name: string;
}

export interface PairingResponse {
  success: boolean;
  device_token?: string;
  error?: string;
}

// 拡張がAPIから取得するジョブ詳細
export interface JobCredentials {
  job_id: string;
  channel_code: string;
  login_url: string;
  login_id: string;
  password: string;
  extra_fields: Record<string, string>;
}

// 拡張の状態
export interface ExtensionStatus {
  paired: boolean;
  device_name: string | null;
  portal_url: string | null;
  pending_jobs: number;
}
