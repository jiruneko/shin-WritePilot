# 11月11日 学習履歴保存の仕上げ

## 基準と調査結果
- GitHubは確認・承認済みの `jiruneko/shin-WritePilot`。リモート基準は `ce1db31`、復旧・キー重複修正を含む。
- 作業環境ではHEAD `87a4926` のtreeがリモートと一致し、未コミット変更はなかった。新規作業ブランチ `fix/quiz-history-completion` で変更。リモートへpushしない。
- ユーザーのMacは別環境。直近の申告では `backup/quiz-local-20261111`、統合コミット `546f8e3` にキー修正を追加した状態。未コミット修正、サムネイルの許可処理、ローカルSupabase設定をこの環境から直接調査・変更してはいない。
- 直前のStudio画像ではクイズテーブルと3問は存在し、履歴テーブルは未作成だった。クイズの表示はユーザー確認済み。
- 誤って別ディレクトリ `writepilot` のサーバーを動かしていた問題は、`writepilot-quiz-local` のサーバーに切り替えて解消。

## 既存実装を維持
`202611110001_quiz_attempt_history.sql` に、履歴テーブル・クイズUUID追加・RLS・保存RPCがすでに実装されている。新しい履歴テーブルや重複マイグレーションは追加しない。
- 既存動画UUIDをそのまま使用。クイズUUIDのみ既存テスト行に付加し、問題と正解・視聴権限を変更しない。
- 履歴は user_id, video_id, quiz_id, answers, correct, correct_count, question_count, percentage, taken_at, submission_id, 公開設問スナップショット。
- 認証はサーバーで確認。DBでもauth.uid()/auth.role()を確認し、クライアントから点数やuser_idを受け取らない。
- 既存の `video_quiz` が採点と現行の視聴権限確認を行い、同一DBトランザクションで履歴をINSERT。
- 自分の履歴SELECTだけをRLSで許可し、直接INSERT/UPDATE/DELETEは禁止。正解番号は非公開のまま。
- ユーザーと送信UUIDの一意制約とトランザクションロックで二重送信を防ぐ。同じキーで回答を変えると拒否。再受験時は新しいキー。
- 動画視聴完了は別テーブルのまま。
- クイズ表示はStorageの署名URL取得から独立。履歴取得エラーもクイズを消さない。completion: / quiz: のReactキーを維持。

## 今回の変更
- 保存RPC/履歴テーブルが未適用の場合、その状態を画面に明示し、保存済みと表示しない。
- 送信ボタンを「採点・保存中」「保存済み」「同じ回答で再試行」に変更。既存の3問UIは維持。
- 保存失敗時に行が残らず、同じキーで再試行できるSQLテストを追加。移行後の動画・権限・問題の不変性も確認。
- 実コンポーネント＋実CSSのPlaywrightテストをデスクトップ/モバイルに追加。通信部分はテスト用応答へ差し替えるため、実SupabaseのE2Eテストではない。

## Mac：今回の新規コード取得について
今回の変更はpush承認前。まだ `git pull` では取得できない。
一方、保存の本体と適用対象のSQLは既にMacに取り込まれているため、以下のDB準備は新規コードのpush前でも実行できる。

## Mac：既存SQL1本だけをローカルに適用
1. 別ターミナルで作業場所と差分を確認。
```bash
cd /Users/nagatsukakenji/writepilot-quiz-local
git status --short --branch
grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local
npx supabase status
```
接続先は `http://127.0.0.1:54321`。Next.jsもこのディレクトリから起動していることを確認する。キーは共有しない。

2. StudioのURLが **http://127.0.0.1:54323** であることを確認。SQL Editorで `supabase/quiz_history_verify_readonly.sql` を実行する（新規ファイルはpush後に取得）。既存の画面確認結果でも以下を満たすことを確認する。
- `private.video_quizzes` と既存の `video_quiz` が存在。
- 対象動画は公開済み、削除中ではなく、同じUUIDに3問が紐付く。
- `video_quiz_attempts` / `submit_video_quiz` が未作成で、クイズの `id` 列がまだない。
既に存在する場合、元のSQLを再実行しない。不整合があれば出力を確認する。

3. 既存マイグレーション1本だけをクリップボードにコピー。
```bash
pbcopy < supabase/migrations/202611110001_quiz_attempt_history.sql
```
ローカルStudioの新しいSQL Editorに貼り付け、Runを押す。SQLにはBEGIN/COMMITがあり、途中失敗時に部分適用しない。失敗時は繰り返し実行せずエラーを確認する。
このSQLはクイズのseed・動画更新・データ削除を含まない。`migration up --local` で他の未適用ファイルまで一括適用しない。

4. 同じローカルStudioでAPIのスキーマキャッシュ更新。
```sql
NOTIFY pgrst, 'reload schema';
```
5. 読み取り専用SQLをもう一度実行する。期待：history_table/save_rpcが存在し、quiz_has_stable_id=true、history_rls_enabled=true。authenticated_execute=true、anonymous_execute=false。既存3問・動画UUID・公開状態が変わっていない。

SQL Editorでの手動適用はSupabase CLIのmigration履歴へ自動登録されない。後日 `migration list --local` と実スキーマを照合し、この適用済みSQLの再実行を避ける。11月10日のクイズseed入りSQLや全マイグレーションは再実行しない。

## ブラウザ最終確認
http://127.0.0.1:3100/videos の一覧から対象動画を開く（URLのUUIDは環境ごとに異なるため固定しない）。
1. 動画・サムネイル・クイズ3問と各3選択肢を確認。
2. 全問回答→提出。正答数、正答率、保存成功と履歴1件を確認。
3. ページ更新、ログアウト・再ログインでも履歴が残ることを確認。
4. 再受験で別回答を送信し、前の履歴と新しい履歴が両方残ることを確認。
5. 別ユーザーで他人の履歴が見えないことを確認。
6. オフラインで送信し、エラー表示後オンラインに戻して同じ回答で再試行。1件だけ保存されることを確認。
7. スマートフォンで3問とボタンが操作できることを確認。Macの127.0.0.1 URLはスマホ自身を指すため、そのURLをスマホに渡さない。LAN公開する場合は別途開発用OriginとSupabaseの接続経路を確認する。
8. 動画再生、アップロード、サムネイル表示、有料/非公開動画の権限制御も確認。

実SupabaseやMacのブラウザには直接アクセスできないため、上記はユーザー側での最終確認が必要。

## 自動テスト
```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:quiz-ui
```
`test:quiz-ui` は実コンポーネントの表示・回答・3採点パターン・保存成功/失敗・同一キー再試行・再受験・連打防止・モバイル幅を検証する。通信はテスト用応答に置換し、実Supabaseの保存・RLSはVitest/PGliteで別途検証する。

## 11月12日の準備
設問順、設問文・選択肢のスナップショット、ユーザー回答、各問正誤、テストUUIDが揃う。設問カテゴリ/学習目標の定義、誤答解説の生成・検証、復習候補の選定を次に行う。現状、問題の個別UUIDやカテゴリはなく、分析時はquiz_idと設問順で対応する。過去履歴の問題文は現在のクイズ内容ではなく保存済みスナップショットを使う。

## この作業環境での結果
- Vitest：108件成功。Mac固有のサムネイル修正テストはこのチェックアウトには含まれない。
- 型チェック、lint、Next.jsビルド：成功。
- Playwright：10ケースの実行を試みたが、環境のsocket制限でChromiumが起動できず、ブラウザ上の検証は未実施。テスト対象アプリの失敗を検出した結果ではない。
- ローカルSupabase実機、再ログイン、スマートフォン実機、実動画アップロード・再生は未検証。本番DB変更・デプロイ・pushは未実施。
