# IT's てらこや・WritePilot 権限管理

## 適用順序

既存の 202610010001 / 202610050001 が適用済みであることを確認し、
1. `202610260001_terakoya_catalog.sql`
2. `202610260002_video_entitlements.sql`
を Supabase の SQL Editor または Supabase CLI で順番に適用してください。

**本番環境へのSQL実行はこのPRでは行っていません。** 適用前にDBバックアップを取ってください。

## 初期状態

- 既存動画は `WRITEPILOT / PAID`。一般ユーザーには表示されなくなります。
- `TERAKOYA / FREE` の公開済みYouTube教材のみ、未ログイン閲覧可。
- 管理者は教材管理を継続可能。
- 有料教材の購入者権限は `video_entitlements` に1ユーザー・1教材単位で保存。
- **決済連携はありません**。購入後の権限付与は後続の安全なサーバー処理が必要です。

## 手動権限付与（管理者のみ・Supabase SQL Editor）

```sql
insert into public.video_entitlements (user_id, video_id)
values ('<auth-user-uuid>'::uuid, '<video-uuid>'::uuid)
on conflict do nothing;
```

取り消し:
```sql
delete from public.video_entitlements
where user_id = '<auth-user-uuid>'::uuid and video_id = '<video-uuid>'::uuid;
```

## 動作確認

- 未ログイン：`/terakoya` に無料YouTube講座が表示される
- 未ログイン：`/videos` はログインへ転送
- 無権限の一般ユーザー：有料動画は一覧に出ず、詳細URLからの閲覧も不可
- 有料の受講権限付与後：該当動画のみ表示され、MP4は本人のセッションからだけ署名URL発行可
- 権限削除後：新しい署名URLは発行不可（発行済みURLは最長300秒程度有効）
- 非公開・削除中：一般ユーザーには表示しない
- 全テストとCIが通過するまで本番へマージしない

**注意**：この仕組みは購入履歴を自動判定しません。データベース側で権限を付けるまで有料教材は閲覧不可です。
