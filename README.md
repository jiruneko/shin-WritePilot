# WritePilot

管理者が動画教材を登録・公開し、ログインした利用者が自分のペースで視聴できる、小規模向けオンラインLMSです。既存トップページのダークデザイン・文言とSupabase接続コードを維持しています。

Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Supabase Auth・PostgreSQL・Storage / `@supabase/ssr`。第1版は動画学習とアカウント管理に範囲を限定しています。

## ローカル起動

Node.js 22 LTS、npm、Supabaseプロジェクトを用意してください。

```sh
git clone https://github.com/jiruneko/shin-WritePilot.git
cd shin-WritePilot
npm install
cp .env.example .env.local
# 以下のSupabaseセットアップと環境変数の入力を完了する
npm run dev
```

`http://localhost:3000` を開きます。既存チェックアウトでは `npm ci` でも再現できます。`.env.local` はGit管理対象外です。

### 環境変数

`.env.example` は変数名と空欄だけです。実値は `.env.local` とデプロイ先の環境変数に設定してください。

| 名前 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key（従来のanon keyも利用可能） |
| `SUPABASE_SERVICE_ROLE_KEY` | 退会でAuthユーザーを削除するサーバー専用service role key |

service role keyを`NEXT_PUBLIC_`で始まる変数に設定したり、ブラウザー・ログ・Gitに出したりしないでください。動画の管理・視聴はユーザーのセッションとRLSを使い、service roleによる権限回避はしません。

公開キー未設定でもトップ・認証画面は表示できますが認証操作は失敗します。DB未セットアップ時はLMSにエラー画面が表示されます。service role key未設定では退会を完了できません。

## Supabaseセットアップ

### 1. Auth

1. Authentication → ProvidersでEmailを有効にします。Confirm email有効を推奨します。パスワードの最小長は12文字以上に設定してください。
2. Authentication → URL Configuration → Site URLをアプリのURLに設定します。開発時は `http://localhost:3000`、本番では実際のHTTPS URLを指定します。
3. Authentication → Email Templates → Confirm signupの確認リンクを以下に変更してください。標準の `ConfirmationURL` のままではこのアプリの確認処理を通りません。

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">メールアドレスを確認して登録を完了する</a>
```

4. 本番ではカスタムSMTP・送信元・Authレート制限を設定し、配信を実際に確認してください。確認メール無効の開発環境は登録直後、有効の場合は確認リンク成功後に `/dashboard` へ遷移します。

### 2. DB migration・Storage

Supabase Dashboard → SQL Editorで、次のファイル**全体**を一度実行します。

[`supabase/migrations/202610010001_video_lms.sql`](supabase/migrations/202610010001_video_lms.sql)

SQLはトランザクションで適用します。新規テーブルを作成するため、再実行用ではありません。既に独自の`profiles` / `videos`テーブルがあるプロジェクトにはそのまま適用せず、既存スキーマとの差分を先に確認してください。CLIを利用している場合も同じmigrationを通常のmigration管理で適用できます。必要なセットアップSQLはこの1ファイルにまとめています。

SQLは以下を作成・設定します。

- `profiles`: AuthのユーザーIDを主キー・外部キーにし、email / display_name / role / created_at / updated_atを保持。既存AuthユーザーをUSERとして取り込み、新規登録とメール変更をトリガーで同期。Auth削除でプロフィールも削除。
- `videos`: title / description / storage_path / thumbnail_url / is_published / created_by / created_at / updated_atと、初回公開日時`published_at`・削除待ちフラグ`is_deleting`。
- 両テーブルのRLSと必要最小限の権限。`profiles`は本人のSELECTのみで、クライアントからのrole更新やINSERTを許可しません。
- `private`スキーマに権限判定用関数。関数は固定search_pathを使用し、本人のIDに基づいて判定します。`private`をData APIの公開スキーマに追加しないでください。
- **非公開**Storage Bucket `videos`。MP4 (`video/mp4`) のみ、1ファイル**50MiB（52,428,800 bytes）**まで。既存の同名Bucketがあればこの非公開・サイズ設定へ更新します。
- StorageのSELECT・INSERT・DELETEポリシー。既存の広い許可ポリシーがあっても`videos`に対する制限を維持するrestrictive policyを追加します。動画の上書きUPDATEは管理者にも許可しません。

Dashboard → Storageで `videos` が **Private** であることを確認してください。手動でPublicに切り替えないでください。Supabase側のプロジェクト全体の最大ファイルサイズも50MiB以上に設定してください。Data APIで`public`スキーマが利用できることを確認します。

### 3. 管理者アカウント（現在は1名を想定）

まずアプリの `/signup` から管理者にするメールアドレスで登録し、メール確認を済ませます。Authentication → Usersで本人のUUIDを確認します。SQL Editorで対象の1行を設定してください（UUIDを実値に置き換えます）。

```sql
update public.profiles
set role = 'ADMIN'
where id = '管理者本人のAuthユーザーUUID'::uuid;

select id, email, role from public.profiles where role = 'ADMIN';
```

`ADMIN`が意図した本人のみであることを確認し、アプリを再読み込みしてください。通常はすべて`USER`です。管理者判定にメールの直書きやユーザーが編集可能なAuth metadataを使用しません。権限はリクエスト時にDBで確認するため、変更後の再ログインは必須ではありません。

権限を解除する場合は同じUUIDに `role = 'USER'` を設定します。クライアントアプリからの昇格手段は設けていません。

## 実装済み機能

| URL / 操作 | 内容 |
| --- | --- |
| `/` | 既存トップページ。ログイン済みの導線をdashboardへ接続 |
| `/signup`, `/login`, `/auth/confirm` | メール＋パスワード登録・確認・ログイン |
| `/dashboard` | 学習ホーム、アカウント情報、動画・ログアウト・管理画面への導線 |
| `/account` | アカウント情報、ログアウト、再認証付き退会 |
| `/videos` | ログイン必須。公開動画のタイトル・説明抜粋・サムネイル・初回公開日時 |
| `/videos/[id]` | 動画プレイヤー・説明。ADMINは非公開動画のプレビューも可能 |
| `/admin` | 管理者ホーム |
| `/admin/videos` | 全動画の管理・削除確認・削除再試行 |
| `/admin/videos/new` | 動画・メタ情報の登録。送信中表示、エラー、保存再試行 |
| `/admin/videos/[id]/edit` | タイトル・説明・サムネイルURL・公開状態の編集 |

各管理画面と各Server Actionで認証・roleを検証します。一般ユーザーによる管理画面への直接アクセスは404、未ログインはログイン画面へ誘導します。UIの非表示だけに依存しません。動画DBとStorageへの直接アクセスもRLSで制限します。

## 動画の操作と障害時の扱い

### アップロード

1. 管理者がタイトル・説明・MP4・任意のHTTPSサムネイルURL・公開状態を入力。
2. Server Actionが現在のAuthユーザーと`profiles.role`を検証し、`ユーザーUUID/動画UUID.mp4`の保存先を作成。
3. ブラウザーが管理者のセッションでStorageへ直接アップロード。Next.js / デプロイ先のリクエストボディ上限を避けます。StorageのRLSが一般ユーザーの送信を拒否します。
4. サーバーが再度管理者権限とStorage上の存在を確認し、パスとメタ情報のみをDBへ登録します。所有者とパスはブラウザーから受け取らずサーバーで決定します。

MP4内のコーデックまで変換しません。H.264映像＋AAC音声を推奨します。アップロード中のタブを閉じないでください。大容量の再開可能アップロードは未実装です。

DB保存に失敗しても、応答だけが失われ実際には保存済みの可能性があるため、動画ファイルを即削除しません。同じ画面で再試行すると同じIDを使用します。画面を閉じた場合やアップロードの応答を失った場合、未参照ファイルが残る可能性があります。管理者はStorage Dashboardのオブジェクトパスと`videos.storage_path`を照合し、どの動画からも参照されていないことを確認してから**Storage Dashboardでファイルを削除**してください。`storage.objects`をSQLで直接DELETEすると実ファイルが残るため行わないでください。

### 編集・削除

第1版はメタ情報編集に限定します。動画ファイルは上書き不可です。差し替える場合は新しい動画として登録・確認し、旧動画を非公開または削除してください。これにより再生中ファイルの上書きと差し替え失敗時の不整合を避けています。

削除は確認UIの後、(1) `is_deleting=true`で非公開化 → (2) Storage削除 → (3) DB削除の順です。DBとStorageを同一トランザクションで処理できないため、途中失敗時は削除待ち行を残します。管理画面の「削除を再試行」で完了できます。削除待ちは編集・再公開できません。

### 再生・公開範囲

公開動画もログインが必要です。Storageはprivateで、ユーザーのRLS権限で**5分間の署名付きURL**を発行します。再生・シーク時の失敗では権限を再確認してURLを更新し、可能な限り再生位置を復元します。通信障害や非対応コーデックはエラーと再試行ボタンで案内します。

署名付きURLは期限まで共有先でも使えるBearer URLです。非公開化・退会・権限変更は新規取得時に反映されますが、既発行URLは最大5分、取得済み・バッファ済みの動画はその後も閲覧され得ます。DRMやダウンロード防止を保証する方式ではありません。サムネイルは管理者が指定する外部HTTPS画像であり、教材の秘密情報を含めないでください。

### 退会

確認チェックと現在のパスワードによる再認証後、サーバーで検証した本人のIDだけをAuth Admin APIで削除します。プロフィールは外部キーで連動削除します。ログアウトは現在のブラウザーが対象です。

管理者の教材を無断で巻き込まないよう、アップロード済み教材がある場合は先に管理画面で動画を削除する必要があります。未保存の孤立ファイルなど、Auth削除を阻むStorage所有物が残っていればStorage Dashboardで確認・削除してから再試行してください。失敗を退会完了とは表示しません。必要なら先に別の管理者アカウントへ運用を引き継ぎます。

## セキュリティ・セッション

- Next.js 16の`proxy.ts`とSupabase SSRの`getAll` / `setAll`を使用。Cookie更新とSDKが渡すキャッシュ関連ヘッダーを応答へ反映します。
- 保護ページ・操作で`getUser()`による現在のAuthユーザー確認を行います。`getSession()`のユーザー情報だけを認証根拠にしません。
- プロフィールの存在もRLSで確認し、退会済みユーザーの古いJWTによる公開動画の新規取得を拒否します。
- 認証・学習・管理のルートに`private, no-store`を設定し、Server ActionsのOrigin検証を維持します。
- 一般ユーザーは公開動画のSELECTのみ。ADMINだけが動画のINSERT / UPDATE / DELETEとStorageのアップロード・削除を行えます。
- SQL内の権限関数は固定search_path。Auth metadata経由でroleを設定しません。プロフィールの自己昇格も禁止しています。

参照: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)、[Storageアクセス制御](https://supabase.com/docs/guides/storage/security/access-control)。Next.jsの実装時にはインストール済み `node_modules/next/dist/docs/` のProxy・Server Actions・cookies・dynamic routes・Route Handlersを確認しています。

## 検証

```sh
npm run lint
npm run typecheck
npm test
npm run build
# 初回のみブラウザーを導入
npx playwright install chromium
npm run test:smoke
```

- Vitest: 認証の成功・失敗・本人確認、管理画面/Server Action権限、改ざん・入力検証、Storage/DB障害時の再試行、再生URLの権限確認をテスト。
- PGlite: PostgreSQL上で実migrationを実行し、USER / ADMIN / anonのDB・Storage RLS、metadataでの自己昇格、退会後の古いJWT相当、非公開化、削除待ち、旧Storage許可ポリシーとの共存を検証。AuthとStorageのシステムテーブルは最小限のテスト用スキーマであり、ホストされたサービス自体は検証していません。
- Playwright: 本番ビルドをPC・スマートフォンサイズで起動し、トップ・登録・ログイン画面と保護ページの未ログイン転送を確認します。Supabaseの環境変数は意図的に空にして再ビルドし、実データには接続しません（ローカルの`.next`出力を上書きします）。

### 実Supabaseで必ず行う受け入れ確認

このリポジトリの自動検証だけでは、実際のメール配送・Storage通信・MP4再生・本番設定までは確認できません。開発用Supabaseで使い捨てのUSERとADMIN、小さなMP4を用意して以下を確認してください。

1. USER新規登録 → メール確認 → dashboard。ログアウト後に再ログイン。
2. 未ログインでdashboard / videos / adminへアクセスするとloginへ遷移。
3. USERが`/admin`・新規登録・編集URLに直アクセスしても拒否。
4. USERセッションでSupabaseへの動画INSERT / UPDATE / DELETE・Storageアップロードが拒否される（自動SQLテストでも検証）。
5. ADMINが動画を非公開でアップロードし、管理一覧とプレビューで確認。
6. USERの一覧・直接URL・Storageで非公開動画が取得できない。
7. ADMINが公開するとUSERの一覧へ表示され、HTML5プレイヤーで再生・シークできる。
8. ADMINがタイトル・説明・サムネイルを編集し、公開を切り替えられる。
9. 5分以上待った後のシーク・再生失敗から、URL更新・再試行で再生できる。
10. ADMINが削除をキャンセルでき、確定時はDB行とStorageファイルの両方が消える。
11. USERが誤パスワードでは退会できず、正しいパスワードで退会できる。プロフィールも消え、再ログインできない。
12. 教材が残るADMINの退会が止まる。教材・未参照Storageファイルを整理すると退会できる。
13. 実メール配信、セッション期限経過後の更新、PC・スマホの実端末での動画形式・通信断も確認。

## 本番デプロイ

1. Node.js対応のNext.jsホストにデプロイします。ビルドは`npm run build`、起動は`npm start`。静的exportには対応しません。
2. 本番用SupabaseにSQLを適用し、`videos`がPrivate、RLSが有効であることを確認します。
3. 3つの環境変数をホストへ設定して再ビルド・デプロイします。公開キーはビルド時にクライアントへ埋め込まれるため、変更後は再ビルドが必要です。
4. Site URL・確認メール・SMTPを本番URLに合わせ、管理者UUIDとroleを確認します。
5. CDNで認証・動画ページや署名付きURLを公開キャッシュしないでください。独自CSPがある場合はSupabaseへの接続・動画配信と指定サムネイルの画像配信を許可します。無制限のServer Actions allowedOriginsは追加しないでください。
6. 上記受け入れ確認を実施します。Supabaseの容量・転送量・メール送信制限とバックアップを運用で監視してください。

この実装をmergeするだけでは既存SupabaseへSQLは適用されません。デプロイ前にセットアップしてください。

## 第1版の範囲と拡張

Course / Section / Lesson / Quiz、WritePilot for キッズ / for Works、課金、パスワードリセット、SNSログイン、トランスコード、字幕、再開可能な大容量アップロード、ページ分割は未実装です。一覧は小規模な教材数を想定します。

動画のUUID・メタ情報・保存パスを独立して管理しているため、将来`lessons.video_id`や`progress.user_id`などの関連テーブルを追加できます。Auth・権限・動画入力検証・UIを分離し、既存トップページの全面作り直しは行っていません。

## 学習完了と進捗（追加PR）

既存の動画教材一覧・詳細を使い、ログイン本人の学習完了をDBに保存します。
学習ホームと一覧に公開中の教材数・完了数・割合を表示します。
サンプル3教材の投入SQL、追加マイグレーション、Supabase画面での適用手順と確認項目は
[学習機能のセットアップ](docs/learning-setup.md) を参照してください。
