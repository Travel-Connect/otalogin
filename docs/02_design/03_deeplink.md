# F8: ディープリンク実行 - 詳細設計

## 概要

URLパラメータで施設×チャネルを指定し、選択状態にして表示。
`run=1` 指定時は自動でログイン実行まで進める。
StreamDeck等の外部ツールからワンクリック操作を実現する。

## URL仕様

### パス

```
/facility/<facility_uuid>
```

facility_uuid は既存の `facilities.id`（UUID）をそのまま使用。

### クエリパラメータ

| パラメータ | 必須 | 説明 | 例 |
|-----------|------|------|-----|
| `channelId` | - | チャネルUUID（最優先） | `channelId=550e8400-...` |
| `channel` | - | チャネルコード or エイリアス | `channel=jalan` |
| `OTA` / `ota` | - | OTAエイリアス（互換） | `OTA=jaran` |
| `run` | - | `1` の場合、自動ログイン実行 | `run=1` |

### URL例

```
# じゃらんを選択状態で開く
/facility/abc123?channel=jalan

# じゃらんを自動ログイン実行
/facility/abc123?channel=jalan&run=1

# エイリアスで指定（jaran → jalan に解決）
/facility/abc123?OTA=jaran&run=1

# チャネルUUIDで直接指定
/facility/abc123?channelId=550e8400-e29b-41d4-a716-446655440000

# 楽天トラベルをエイリアスで指定
/facility/abc123?channel=rakutentravel&run=1
```

## チャネル解決の優先順位

```
1. channelId（UUID直接指定）→ channels.id で完全一致
   ↓ 見つからない場合
2. channel パラメータ
   a. UUID として channels.id で検索
   b. channels.code で完全一致（小文字正規化）
   c. CHANNEL_ALIASES マッピングで解決
   ↓ 見つからない場合
3. OTA / ota パラメータ
   a. channels.code で完全一致（小文字正規化）
   b. CHANNEL_ALIASES マッピングで解決
   ↓ 見つからない場合
4. 無視（通常表示 = 先頭チャネルが選択される）
```

## エイリアスマッピング

`packages/shared/src/constants/channels.ts` の `CHANNEL_ALIASES` で定義:

| エイリアス | 解決先 |
|-----------|--------|
| `jaran` | `jalan` |
| `rakutentravel` | `rakuten` |
| `1kyu` | `ikyu` |
| `tl-lincoln` | `lincoln` |
| `tllincoln` | `lincoln` |

正規コード（`jalan`, `rakuten` 等）はそのまま解決される。

## 実行フロー

### run なし（選択のみ）

```
1. ユーザーがURLにアクセス
2. サーバーサイドで searchParams を解析
3. resolveDeepLinkChannel() でチャネルコードを解決
4. FacilityDetail に initialChannel を渡す
5. クライアントサイド:
   a. 指定チャネルのタブが選択状態になる
   b. チャネル詳細カードにリングハイライト表示
   c. チャネル詳細エリアにスムーズスクロール
```

### run=1（自動実行）

```
1. ユーザーがURLにアクセス（?channel=jalan&run=1）
2. サーバーサイドで searchParams を解析
3. FacilityDetail に initialChannel + autoRun=true を渡す
4. クライアントサイド:
   a. チャネル選択・ハイライト・スクロール（上記と同じ）
   b. 拡張機能の接続チェック完了を待機
   c. 500ms 遅延後に handleLogin() を自動実行:
      - POST /api/extension/dispatch → job_id 取得
      - chrome.runtime.sendMessage(DISPATCH_LOGIN) → 拡張に実行依頼
      - 拡張が同一ウィンドウにタブを作成しログイン実行
      - 成功/失敗メッセージをUI表示
   d. autoRunTriggered ref で二重実行を防止
```

### 未ログイン時

```
1. ユーザーがURLにアクセス（未ログイン）
2. サーバーサイドで user がないことを検出
3. redirect('/login?returnTo=/facility/<id>?channel=jalan&run=1')
4. ログインフォーム表示
5. ログイン成功後、returnTo パラメータのURLにリダイレクト
6. 以降は通常のディープリンクフローが実行される
```

## セキュリティ注意点

1. **URLに機密情報は絶対に含めない**
   - 受け付けるのは facility_id / channel 識別子 / run フラグのみ
   - ID/PW等のクレデンシャルはURLに一切含めない

2. **returnTo はアプリ内パスのみ**
   - `returnTo` が `/` で始まるパスのみ許可
   - 外部URLへのリダイレクトは拒否（オープンリダイレクト防止）

3. **run=1 はログイン済みのみ**
   - 未ログイン状態ではログイン画面にリダイレクト
   - ログイン後に returnTo で復帰しディープリンクが実行される

4. **不正パラメータの安全な無視**
   - 存在しないチャネル指定は無視（通常表示にフォールバック）
   - run=1 でもチャネル未指定なら実行しない（`autoRun && !!deepLinkChannel`）

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `packages/shared/src/constants/channels.ts` | `CHANNEL_ALIASES`, `resolveChannelCode()` 追加 |
| `apps/web/src/app/facility/[facilityId]/page.tsx` | searchParams 解析、returnTo付きリダイレクト |
| `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx` | initialChannel/autoRun props、ハイライト/スクロール/自動実行 |
| `apps/web/src/app/login/page.tsx` | returnTo パラメータ対応 |
