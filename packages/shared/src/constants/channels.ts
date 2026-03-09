import type { ChannelCode } from '../types/channel';

/**
 * ログインステップの定義（マルチステップログイン用）
 */
export interface LoginStep {
  /** 入力フィールドのセレクタ */
  input: string;
  /** 入力する値のキー（'username' | 'password' | extra_fieldsのkey） */
  value_key: 'username' | 'password' | string;
  /** 次へ進むボタンのセレクタ */
  submit: string;
  /** 次のステップが表示されるまで待機するセレクタ（省略時は次のステップのinputを待機） */
  wait_for?: string;
}

/**
 * ログイン後のアクション定義
 */
export interface PostLoginAction {
  /** アクションのタイプ */
  type: 'select_facility';
  /** ドロップダウン選択（検索前に必要な場合） */
  dropdown_select?: {
    /** ドロップダウンのセレクタ（クリックして開く） */
    trigger: string;
    /** 選択するオプションのテキスト */
    option_text: string;
  };
  /** 検索入力欄のセレクタ（検索が必要な場合） */
  search_input?: string;
  /** 検索ボタンのセレクタ（検索が必要な場合） */
  search_submit?: string;
  /** 施設一覧の行セレクタ */
  row_selector: string;
  /** 施設IDが表示される列のインデックス（0始まり） */
  id_column_index: number;
  /** 施設IDのキー（extra_fieldsで指定） */
  id_key: string;
  /** 検索入力後にEnterキーで送信する（行クリック不要の場合） */
  submit_with_enter?: boolean;
}

export interface ChannelConfig {
  name: string;
  login_url: string;
  /** シングルステップログイン用のセレクタ（login_stepsが未定義の場合に使用） */
  selectors?: {
    username: string;
    password: string;
    submit: string;
    success_indicator: string;
  };
  /** マルチステップログイン用のステップ定義 */
  login_steps?: LoginStep[];
  /** ログイン成功を判定するセレクタ（複数指定可、カンマ区切り） */
  success_indicator?: string;
  /** ログイン後のアクション（施設選択など） */
  post_login_action?: PostLoginAction;
  /** pending_login_check のタイムアウト（ms）。OTP等の手動ステップがある場合は長めに設定。デフォルト60秒 */
  pending_timeout_ms?: number;
  /** 追加フィールド */
  extra_fields?: {
    key: string;
    label: string;
    selector?: string;
  }[];
  /** 強制ログイン設定（既にログイン中の場合に強制ログインボタンをクリック） */
  force_login?: {
    /** 強制ログインページを検出するテキスト */
    detect_text: string;
    /** クリックするボタンのテキスト */
    button_text: string;
  };
}

export const CHANNEL_CONFIGS: Record<ChannelCode, ChannelConfig> = {
  rakuten: {
    name: '楽天トラベル',
    login_url: 'https://api.travel.rakuten.com/everest/extranet/omni/startPage',
    // マルチステップログイン（SSO: ID入力→次へ→PW入力→次へ）
    // 楽天SSOログインページ (login.account.rakuten.com) のセレクタ
    login_steps: [
      {
        input: '#user_id',
        value_key: 'username',
        submit: '#cta001',
        wait_for: '#password_current',
      },
      {
        input: '#password_current',
        value_key: 'password',
        submit: '#cta011',
      },
    ],
    // ログイン成功はリダイレクト後のページで判定
    success_indicator: '[data-testid="subscription-selection-table-row"], .service-selection',
    // ログイン後に施設を検索して選択
    post_login_action: {
      type: 'select_facility',
      // ドロップダウンを「子クライアント」に変更
      dropdown_select: {
        trigger: '#partnerSelectionType',
        option_text: '子クライアント',
      },
      search_input: '#contractId',
      search_submit: 'button[type="submit"].btn-primary',
      row_selector: 'tr[data-testid="subscription-selection-table-row"]',
      id_column_index: 1,
      id_key: 'facility_id',
    },
    // 施設IDは追加フィールドとして渡す
    extra_fields: [
      {
        key: 'facility_id',
        label: '施設ID',
      },
    ],
  },
  jalan: {
    name: 'じゃらん',
    login_url: 'https://wwws.jalan.net/yw/ywp0100/ywt0100LoginTop.do',
    selectors: {
      username: 'input[name="usrId"]',
      password: 'input[name="usrPwd"]',
      submit: 'a.login-btn',
      success_indicator: '.logout, a[href*="logout"], .user-info, .welcome',
    },
  },
  neppan: {
    name: 'ねっぱん',
    login_url: 'https://asp.hotel-story.ne.jp/ver3/ASPU0201.asp',
    selectors: {
      username: '#loginId',
      password: '#password',
      submit: '#LoginBtn',
      success_indicator: '.menu, #menu, .main-contents, #main-contents, .logout, a[href*="logout"]',
    },
    extra_fields: [
      {
        key: 'hotel_id',
        label: '契約コード',
        selector: '#clientCode',
      },
    ],
  },
  ikyu: {
    name: '一休',
    login_url: 'https://www.ikyu.com/accommodation/ap/AsfW10101.aspx',
    selectors: {
      // D列の施設IDをlogin_id(username)として使用
      username: '#ctl00_ContentPlaceHolderMain_TriesteTextAccommodationID',
      password: '#ctl00_ContentPlaceHolderMain_TriesteTextPassword',
      submit: '#ctl00_ContentPlaceHolderMain_TriesteButtonLogin',
      success_indicator: '.logout, a[href*="logout"], .menu, #menu, .main-contents',
    },
    extra_fields: [
      {
        key: 'operator_id',
        label: 'オペレータID',
        selector: '#ctl00_ContentPlaceHolderMain_TriesteTextOperatorID',
      },
    ],
  },
  skyticket: {
    name: 'スカイチケット',
    login_url: 'https://hotel-hm.skyticket.jp/login',
    selectors: {
      username: 'form input[type="text"]',
      password: 'form input[type="password"]',
      submit: 'form button[type="submit"]',
      success_indicator: '.logout, a[href*="logout"], .dashboard, .menu, .sidebar',
    },
  },
  churatoku: {
    name: 'ちゅらとく',
    login_url: 'https://www.churatoku.net/app_sys/kanri/kanri_login.aspx',
    selectors: {
      username: '#Login_id',
      password: '#Login_pw',
      submit: '#Login',
      success_indicator: '.logout, a[href*="logout"], .menu, #menu, .main-contents',
    },
  },
  ots: {
    name: 'OTS',
    login_url: 'https://www.otsinternational.jp/hotel/admin/',
    selectors: {
      username: '#CmnAdminLoginUser',
      password: '#CmnAdminLoginPassword',
      submit: '#loginForm input[type="submit"]',
      success_indicator: '.logout, a[href*="logout"], .menu, #menu, .main-contents, .dashboard',
    },
  },
  lincoln: {
    name: 'リンカーン',
    login_url: 'https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do',
    selectors: {
      username: 'input[name="usrId"]',
      password: 'input[name="pwd"]',
      submit: 'a#doLogin',
      success_indicator: '.logout, a[href*="logout"], .menu, #menu, .main-contents, #main-contents',
    },
    // 二段階認証が発生する場合があるため5分待機
    pending_timeout_ms: 300000,
    // 既にログイン中の場合、強制ログインボタンをクリック
    force_login: {
      detect_text: '二重ログイン',
      button_text: '強制ログイン',
    },
  },
  rurubu: {
    name: 'るるぶ',
    login_url: 'https://pics.jtb.co.jp/mldc/ja-jp/public/login',
    // マルチステップ: メール入力→「次へ」→ OTP入力(ユーザー手動) → 施設選択
    login_steps: [
      {
        // data-cy はCypressテスト属性でプロダクションでは除去される可能性があるため、
        // type="email" やプレースホルダー等の汎用セレクタをフォールバックとして追加
        input: 'input[data-cy="unified-email-input"], input[type="email"], input[name*="email"], input[autocomplete*="email"], input[placeholder*="@"]',
        value_key: 'username',
        submit: 'button[data-cy="unified-email-continue-button"], button[type="submit"], form button[class*="continue"], form button[class*="submit"], form button',
        // OTPページが表示されるまで待機
        // これが最後の自動化ステップ。OTPはユーザーが手動入力。
      },
    ],
    // OTP完了後のダッシュボード/施設選択ページで検出
    success_indicator: '[data-testid="search-criteria-input-field"], [data-element-name="ycs-property-search-search-field"]',
    // OTP入力に時間がかかるため5分に延長
    pending_timeout_ms: 300000,
    // ログイン後に施設IDを入力してEnterで検索→結果行をクリック
    post_login_action: {
      type: 'select_facility',
      search_input: '[data-element-name="ycs-property-search-search-field"] input, [data-testid="search-criteria-input-field"] input, input[type="search"], input[placeholder*="検索"], input[placeholder*="search"]',
      submit_with_enter: true,
      // テーブルのデータ行（ヘッダーやナビを除外）
      row_selector: 'tbody tr, table tr:not(:first-child), [role="row"]:not([role="columnheader"]), [data-testid*="property-row"], [data-element-name*="property-row"]',
      id_column_index: 0,
      id_key: 'rurubu_facility_code',
    },
    extra_fields: [
      {
        key: 'rurubu_facility_code',
        label: 'るるぶ施設コード',
      },
    ],
  },
};

export const CHANNEL_CODES: ChannelCode[] = ['rakuten', 'jalan', 'neppan', 'ikyu', 'skyticket', 'churatoku', 'ots', 'lincoln', 'rurubu'];
