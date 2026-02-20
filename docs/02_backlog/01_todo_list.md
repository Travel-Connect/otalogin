# MVP残タスク一覧

最終更新: 2026-02-03

---

## Phase 1: DB統合

### 1.1 施設一覧の実データ取得

- **ファイル**: `apps/web/src/components/FacilityList.tsx`
- **現状**: ダミーデータ `DUMMY_FACILITIES` を使用
- **タスク**:
  - [ ] Supabase から `facilities` テーブルを取得
  - [ ] `channel_health_status` を JOIN して全体ステータス算出
  - [ ] エラーハンドリング追加

```typescript
// 実装例
const { data, error } = await supabase
  .from('facilities')
  .select(`
    *,
    channel_health_status (status)
  `)
  .order('name');
```

### 1.2 施設詳細の実データ取得

- **ファイル**: `apps/web/src/app/facility/[facilityId]/page.tsx`
- **現状**: ダミーデータ `DUMMY_FACILITY` を使用
- **タスク**:
  - [ ] Supabase から施設情報取得
  - [ ] `facility_accounts` を JOIN
  - [ ] `channel_health_status` を JOIN
  - [ ] `channels` マスタと結合してチャネル情報表示

```typescript
// 実装例
const { data: facility } = await supabase
  .from('facilities')
  .select(`
    *,
    facility_accounts (
      *,
      channels (*)
    ),
    channel_health_status (*)
  `)
  .eq('id', facilityId)
  .single();
```

### 1.3 パスワード取得API

- **ファイル**: 新規 `apps/web/src/app/api/facility/[facilityId]/password/route.ts`
- **タスク**:
  - [ ] `facility_accounts` から `password` 取得
  - [ ] 認証チェック（ログインユーザーのみ）
  - [ ] RLS で保護されていることを確認

---

## Phase 2: UI統合

### 2.1 ログイン実行ボタン

- **ファイル**: `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx`
- **タスク**:
  - [ ] チャネルタイルに「ログイン実行」ボタン追加
  - [ ] クリック時に `/api/extension/dispatch` を呼び出し
  - [ ] Chrome拡張にメッセージ送信
  - [ ] 実行状態の表示（loading → success/error）

### 2.2 マスタPW同期ボタン

- **ファイル**: `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx`
- **タスク**:
  - [ ] チャネルタイルに「同期」ボタン追加
  - [ ] `ConfirmDialog` と統合
  - [ ] `/api/master-sync` 呼び出し
  - [ ] **今開いているチャネルのみ** 同期（facilityId + channelId 指定）

### 2.3 shared/override 切替

- **ファイル**: `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx`
- **タスク**:
  - [ ] アカウントタイプ切替UI
  - [ ] shared → override 時のコピー処理
  - [ ] override → shared 時の確認ダイアログ

### 2.4 実行状態ポーリング

- **ファイル**: 新規 `apps/web/src/hooks/useJobStatus.ts`
- **タスク**:
  - [ ] job ID を受け取り、定期的に status を取得
  - [ ] pending → running → completed/failed の遷移表示
  - [ ] 完了時に自動停止

---

## Phase 3: 拡張統合

### 3.1 ポータル→拡張メッセージング確認

- **ファイル**: `apps/extension/src/background/index.ts`
- **タスク**:
  - [ ] `externally_connectable` の設定確認
  - [ ] ポータルからの `DISPATCH_LOGIN` メッセージ受信テスト
  - [ ] エラー時のフィードバック確認

### 3.2 pending job ポーリング（Health Check用）

- **ファイル**: `apps/extension/src/background/index.ts`
- **タスク**:
  - [ ] `/api/extension/pending` エンドポイント作成
  - [ ] 定期ポーリング（5分間隔）
  - [ ] pending job があれば自動実行
  - [ ] device_token による認証

### 3.3 Content Script 動作確認

- **ファイル**: `apps/extension/src/content/index.ts`
- **タスク**:
  - [ ] 楽天トラベルでのログイン動作確認
  - [ ] じゃらんでのログイン動作確認
  - [ ] ねっぱんでのログイン動作確認
  - [ ] エラーハンドリング・リトライ

---

## Phase 4: E2Eテスト

### 4.1 e2e:mock 実装

- **ファイル**: `apps/web/e2e/`
- **タスク**:
  - [ ] ログイン画面テスト
  - [ ] 施設一覧テスト
  - [ ] 施設詳細テスト
  - [ ] mock OTAページでのログイン実行テスト

### 4.2 e2e:real 準備

- **タスク**:
  - [ ] 実OTAアカウント準備（テスト用）
  - [ ] 成果物の機密情報除外確認
  - [ ] 社内テスト実施

---

## 完了チェックリスト

DB統合が完了したら:
- [ ] ダミーデータの削除
- [ ] エラーハンドリングの確認
- [ ] Loading状態の表示確認

UI統合が完了したら:
- [ ] 全ボタンの動作確認
- [ ] ConfirmDialogの表示確認
- [ ] エラーメッセージの表示確認

拡張統合が完了したら:
- [ ] 3 OTA での手動ログイン成功
- [ ] Health Check の自動実行成功
- [ ] ステータスランプの更新確認

E2Eテストが完了したら:
- [ ] `pnpm verify` パス
- [ ] `pnpm e2e:pack` で成果物生成
- [ ] ChatGPTレビュー依頼可能な状態
