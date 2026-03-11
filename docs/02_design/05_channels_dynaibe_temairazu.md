# 新規チャネル追加 - 詳細設計

## 1. 概要

以下の新チャネルを追加する。

| チャネル | コード | カテゴリ | ログイン方式 | 特記事項 |
|---------|--------|----------|-------------|---------|
| DYNA IBE | dynaibe | OTA | シングルステップ | 自社OTA。J列を公式サイトURLとして扱う |
| 手間いらず | temairazu | Systems | シングルステップ | ログインURLは施設ごとに異なる（F列参照）。スプレッドシート上の表記は「moana」 |
| 予約プロ | yoyakupro | OTA | シングルステップ | 自社OTA。J列を公式サイトURLとして扱う |
| tripla | tripla | OTA | シングルステップ | 自社OTA。J列を公式サイトURLとして扱う。Vue.js SPA |
| CHILLNN | chillnn | OTA | シングルステップ | 自社OTA。J列を公式サイトURLとして扱う。ログインボタンがtype="button" |
| ミンパクイン | minpakuin | Systems | シングルステップ | 民泊管理システム |

## 2. DYNA IBE

### 2.1 ログインフォーム解析

- **URL**: `https://d-reserve.jp/hotel-facility-front/HMEM001F00100/HMEM001A01`
- **形式**: SPA（AngularJS）、シングルステップログイン
- **セレクタ**:

| 要素 | セレクタ |
|------|---------|
| ログインID | `input[name="email"]` |
| パスワード | `input[name="password"]` |
| ログインボタン | `button[type="submit"], input[type="submit"]` |
| 成功判定 | `.logout, a[href*="logout"], a[href*="Logout"], .menu, #menu, .main-contents, #main-contents` |

### 2.2 公式サイトURL連携

DYNA IBEは自社の管理ツールであるため、スプレッドシートJ列（公開ページURL）を `facilities.official_site_url` として扱う。

- **マスタ同期時**: dynaibe行のJ列に値がある場合、`facilities.official_site_url` を更新
- **表示箇所**:
  - ダッシュボード施設カード: 施設名横の外部リンクアイコン
  - 施設詳細ページ: 施設名横の外部リンクアイコン

### 2.3 DBマイグレーション

```sql
-- 20260310400000_add_dynaibe_channel.sql
INSERT INTO channels (code, name, login_url)
VALUES ('dynaibe', 'DYNA IBE', 'https://d-reserve.jp/hotel-facility-front/HMEM001F00100/HMEM001A01')
ON CONFLICT (code) DO NOTHING;
```

### 2.4 Chrome拡張

- `host_permissions`: `https://d-reserve.jp/*`
- `content_scripts.matches`: `https://d-reserve.jp/*`

## 3. 手間いらず（temairazu）

### 3.1 ログインフォーム解析

- **URL**: 施設ごとに異なる（例: `https://sv50.temairazu.net/login`）
- **形式**: 従来型サーバーレンダリング、`<form id="login">` によるPOST送信
- **セレクタ**:

| 要素 | セレクタ |
|------|---------|
| ログインID | `input[name="login_id"]` |
| パスワード | `input[name="password"]` |
| ログインボタン | `form#login button[type="submit"]` |
| 成功判定 | `.logout, a[href*="logout"], .menu, #menu, .main-contents, #main-contents, .dashboard` |

### 3.2 施設ごとのログインURL

ねっぱんと同様に、ログインURLが施設ごとに異なる（サブドメインが異なる: `sv50`, `sv51` 等）。
スプレッドシートF列のログインURLが `facility_accounts.login_url` に保存され、ログイン実行時にはこのURLが優先される。

チャネルマスタの `login_url` はデフォルト値（`https://sv50.temairazu.net/login`）。

### 3.3 スプレッドシートマッチング

スプレッドシートC列のOTA名は「moana」と表記される。
`master-sync` APIの `sheetOtaAliases` マッピングで `moana` → `temairazu` に解決する。

### 3.4 DBマイグレーション

```sql
-- 20260310500000_add_temairazu_channel.sql
INSERT INTO channels (code, name, login_url)
VALUES ('temairazu', '手間いらず', 'https://sv50.temairazu.net/login')
ON CONFLICT (code) DO NOTHING;

-- 20260310600000_set_temairazu_category_systems.sql
UPDATE channels SET category = 'Systems' WHERE code = 'temairazu';
```

カテゴリを `Systems` に設定（左側列に表示）。
`channels.category` のデフォルト値が `'OTA'` のため、INSERT後に別途UPDATEが必要。

### 3.5 Chrome拡張

- `host_permissions`: `https://*.temairazu.net/*`（ワイルドカードでサブドメイン対応）
- `content_scripts.matches`: `https://*.temairazu.net/*`

### 3.6 エイリアス

| エイリアス | 解決先 |
|-----------|--------|
| temairazu | temairazu |
| moana | temairazu |
| 手間いらず | temairazu |

## 4. 予約プロ（yoyakupro）

### 4.1 ログインフォーム解析

- **URL**: `https://manage.489pro-x.com/login`
- **形式**: Laravel（AdminLTE）、標準フォームPOST
- **セレクタ**:

| 要素 | セレクタ |
|------|---------|
| ログインID | `input[name="login_id"]` |
| パスワード | `input[name="password"]` |
| ログインボタン | `button[type="submit"]` |
| 成功判定 | `.logout, a[href*="logout"], .menu, #menu, .main-contents, #main-contents, .dashboard, .sidebar` |

### 4.2 公式サイトURL連携

dynaibe同様、J列を `facilities.official_site_url` として保存。

### 4.3 DBマイグレーション

```sql
-- 20260310700000_add_yoyakupro_channel.sql
INSERT INTO channels (code, name, login_url, category)
VALUES ('yoyakupro', '予約プロ', 'https://manage.489pro-x.com/login', 'OTA')
ON CONFLICT (code) DO NOTHING;
```

### 4.4 Chrome拡張

- `host_permissions`: `https://manage.489pro-x.com/*`

### 4.5 エイリアス

| エイリアス | 解決先 |
|-----------|--------|
| yoyakupro | yoyakupro |
| 489pro | yoyakupro |
| 予約プロ | yoyakupro |

## 5. tripla

### 5.1 ログインフォーム解析

- **URL**: `https://cm.tripla.ai/user/sign-in`
- **形式**: Vue.js SPA、`data-cy` テスト属性あり
- **セレクタ**:

| 要素 | セレクタ |
|------|---------|
| Email | `input[data-cy="input-email"]` |
| パスワード | `div[data-cy="input-password"] input[type="password"]` |
| ログインボタン | `button[data-cy="btn-sign-in"]` |
| 成功判定 | `.logout, a[href*="logout"], a[href*="sign-out"], .dashboard, .sidebar, .nav-user` |

OTPコード入力欄があるがブランクでログイン可能。

### 5.2 公式サイトURL連携

dynaibe同様、J列を `facilities.official_site_url` として保存。

### 5.3 DBマイグレーション

```sql
-- 20260311000000_add_tripla_channel.sql
INSERT INTO channels (code, name, login_url, category)
VALUES ('tripla', 'tripla', 'https://cm.tripla.ai/user/sign-in', 'OTA')
ON CONFLICT (code) DO NOTHING;
```

### 5.4 Chrome拡張

- `host_permissions`: `https://cm.tripla.ai/*`

### 5.5 エイリアス

| エイリアス | 解決先 |
|-----------|--------|
| tripla | tripla |
| トリプラ | tripla |

## 6. CHILLNN

### 6.1 ログインフォーム解析

- **URL**: `https://admin.chillnn.com/auth/signin`
- **形式**: React/Next.js SPA、Tailwind CSS
- **注意**: ログインボタンが `type="button"`（`type="submit"` ではない）。クリックイベントで送信。
- **セレクタ**:

| 要素 | セレクタ |
|------|---------|
| Email | `input[name="email"]` |
| パスワード | `input[name="password"]` |
| ログインボタン | `button.w-full` |
| 成功判定 | `.logout, a[href*="logout"], a[href*="signout"], .dashboard, .sidebar, nav` |

### 6.2 公式サイトURL連携

dynaibe同様、J列を `facilities.official_site_url` として保存。

### 6.3 DBマイグレーション

```sql
-- 20260311200000_add_chillnn_channel.sql
INSERT INTO channels (code, name, login_url, category)
VALUES ('chillnn', 'CHILLNN', 'https://admin.chillnn.com/auth/signin', 'OTA')
ON CONFLICT (code) DO NOTHING;
```

### 6.4 Chrome拡張

- `host_permissions`: `https://admin.chillnn.com/*`

### 6.5 エイリアス

| エイリアス | 解決先 |
|-----------|--------|
| chillnn | chillnn |
| チルン | chillnn |

## 7. ミンパクイン（minpakuin）

### 7.1 ログインフォーム解析

- **URL**: `https://connect.minpakuin.jp/host/login`
- **形式**: 従来型サーバーレンダリング、`<form class="p-login">` によるPOST送信
- **セレクタ**:

| 要素 | セレクタ |
|------|---------|
| ログインID | `input[name="login_id"]` |
| パスワード | `input[name="password"]` |
| ログインボタン | `form.p-login button[type="submit"]` |
| 成功判定 | `.logout, a[href*="logout"], .menu, #menu, .main-contents, #main-contents, .dashboard, .sidebar` |

### 7.2 DBマイグレーション

```sql
-- 20260311300000_add_minpakuin_channel.sql
INSERT INTO channels (code, name, login_url, category)
VALUES ('minpakuin', 'ミンパクイン', 'https://connect.minpakuin.jp/host/login', 'Systems')
ON CONFLICT (code) DO NOTHING;
```

### 7.3 Chrome拡張

- `host_permissions`: `https://connect.minpakuin.jp/*`

### 7.4 エイリアス

| エイリアス | 解決先 |
|-----------|--------|
| minpakuin | minpakuin |
| ミンパクイン | minpakuin |

## 8. 共通: 自社OTA公式サイトURL連携

以下のチャネルはJ列のURLを `facilities.official_site_url` として保存する:

```typescript
const officialSiteChannels = ['dynaibe', 'tripla', 'chillnn', 'yoyakupro'];
```

スプレッドシートC列が「公式」の行も同様にJ列を保存。

## 9. 共通: ビジュアル設定

```typescript
// CHANNEL_VISUALS
dynaibe:    { shortName: 'DYNA',       category: 'OTA',     bgColor: '#1B5E20', textColor: '#ffffff' }
temairazu:  { shortName: '手間いらず',   category: 'Systems', bgColor: '#6A1B9A', textColor: '#ffffff' }
yoyakupro:  { shortName: '予約プロ',     category: 'OTA',     bgColor: '#00695C', textColor: '#ffffff' }
tripla:     { shortName: 'tripla',      category: 'OTA',     bgColor: '#E91E63', textColor: '#ffffff' }
chillnn:    { shortName: 'CHILLNN',     category: 'OTA',     bgColor: '#1A237E', textColor: '#ffffff' }
minpakuin:  { shortName: 'ミンパクイン',  category: 'Systems', bgColor: '#FF6F00', textColor: '#ffffff' }
```

## 10. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `supabase/migrations/20260310400000_add_dynaibe_channel.sql` | 新規 | dynaibeチャネルINSERT |
| `supabase/migrations/20260310500000_add_temairazu_channel.sql` | 新規 | temairazuチャネルINSERT |
| `supabase/migrations/20260310600000_set_temairazu_category_systems.sql` | 新規 | temairazuカテゴリ修正 |
| `supabase/migrations/20260310700000_add_yoyakupro_channel.sql` | 新規 | yoyakuproチャネルINSERT |
| `supabase/migrations/20260311000000_add_tripla_channel.sql` | 新規 | triplaチャネルINSERT |
| `supabase/migrations/20260311100000_set_tripla_category_ota.sql` | 新規 | triplaカテゴリ修正 |
| `supabase/migrations/20260311200000_add_chillnn_channel.sql` | 新規 | chillnnチャネルINSERT |
| `supabase/migrations/20260311300000_add_minpakuin_channel.sql` | 新規 | minpakuinチャネルINSERT |
| `supabase/migrations/20260311400000_set_yoyakupro_category_ota.sql` | 新規 | yoyakuproカテゴリ修正 |
| `packages/shared/src/types/channel.ts` | 変更 | ChannelCodeに6チャネル追加 |
| `packages/shared/src/constants/channels.ts` | 変更 | VISUALS/CONFIGS/CODES/ALIASES追加 |
| `apps/extension/public/manifest.json` | 変更 | host_permissions/content_scripts追加 |
| `apps/web/src/app/api/master-sync/route.ts` | 変更 | sheetOtaAliases、officialSiteChannels対応 |
