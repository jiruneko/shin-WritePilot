# WritePilot

Next.js App Router + Supabase Auth によるオンライン学習プラットフォーム。

## ローカル起動

```sh
npm ci
cp .env.example .env.local
# .env.local に対象の Supabase プロジェクトの値を設定
npm run dev
```

- `NEXT_PUBLIC_SUPABASE_URL`: プロジェクトURL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key（従来のanon keyも可）
- `SUPABASE_SERVICE_ROLE_KEY`: **サーバー専用**のservice_role key。退会処理でのみ使用。ブラウザーやGitに公開しない。ホスティング環境にも環境変数として設定する。

公開キー未設定でもトップページ・認証画面は表示されますが、登録・ログインは利用できません。service_role key未設定の場合、退会処理は安全に失敗します。

## Supabase の必須設定

1. Authentication の Email provider を有効にし、Confirm email を有効にする（推奨）。パスワード最小長は12文字以上にする。
2. Authentication → URL Configuration の **Site URL** を実際のアプリURLに設定する。開発環境は `http://localhost:3000`。開発用と本番用のSupabaseプロジェクトは分けることを推奨。
3. Authentication → Email Templates → **Confirm signup** の確認リンクを次に変更する。標準の `ConfirmationURL` のままではこの実装の確認処理を通りません。

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">メールアドレスを確認して登録を完了する</a>
```

4. 本番ではカスタムSMTP、送信元、Authレート制限を設定し、実際に確認メールが届くことを確認する。自動リンク検査を行うメールサービスがリンクを先に開く場合は、確認リンクの期限切れにも注意する。
5. Supabaseのサービスキーをホスティング環境に設定し、再デプロイする。

確認メール有効時はメールリンクからログイン済みのマイページへ移動します。確認メール無効の開発プロジェクトでは登録直後にマイページへ移動します。

## 実装範囲

| URL | 内容 |
| --- | --- |
| `/` | トップページ、ログイン状態に応じたナビゲーション |
| `/signup` | メール・パスワード・パスワード確認による登録 |
| `/login` | ログイン、ログアウト・退会完了の案内 |
| `/auth/confirm` | 確認トークンの検証（signupのみ） |
| `/account` | ログイン必須のマイページ、ログアウト、退会 |

- 変更操作はServer Actions。Next.jsのOrigin検証を維持し、CSRF用に無制限のallowedOriginsを設定しない。
- Proxyが認証Cookieを更新。保護ページと退会処理は毎回 `getUser()` で現在のユーザーを検証し、削除済みユーザーを拒否する。
- ログアウトは現在のブラウザーを対象とする。
- 退会は確認チェックと現在のパスワードで再認証した後、サーバーが検証したIDのみをSupabase Admin APIで削除する。フォームのユーザーIDは使用しない。
- 現時点では独自の学習データ・プロフィールテーブルやStorageファイルはないため、削除対象はAuthアカウント。将来追加するテーブルは所有者への外部キー `ON DELETE CASCADE` 等を定義し、Storageオブジェクトの削除手順も追加する。Storage所有オブジェクトなどが削除を阻む場合、退会失敗として表示する。
- Supabaseの既発行アクセストークンは有効期限まで暗号学的には有効。今後Data APIを追加する際はRLSとユーザー存在確認を設計し、UIの認証だけに依存しない。
- パスワードリセット・SNSログイン・教材機能・課金は今回の対象外。

## 検証

```sh
npm test
npm run lint
npm run build
```

自動テストはAuth APIをモックし、不正入力、認証失敗、未認証アクセス、ログアウト失敗、退会時の本人確認、ID改ざん、削除失敗、確認トークン処理を検証します。実Supabaseでのメール配信や設定は別途必要です。

実プロジェクトでの受け入れ確認（使い捨てのテストアカウントで実施）:

1. 新規登録 → 確認メール → マイページでメールアドレスを確認。
2. ログアウト → `/account` に直接アクセスすると `/login` へ移動。
3. 間違ったパスワードでログインに失敗し、正しいパスワードで成功。
4. リロード・セッション更新後もマイページが表示される。
5. 退会時、確認未チェック・誤パスワードでは削除されない。
6. 正しいパスワードと確認チェックで退会 → 完了表示 → 同じ認証情報でログインできない。
7. 別ブラウザーでログインしていた同じアカウントも、退会後に保護ページへアクセスできない。
8. 期限切れ・再利用した確認リンクがエラー案内になる。
