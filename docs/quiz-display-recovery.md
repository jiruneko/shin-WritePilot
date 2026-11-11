# 理解度クイズ表示の復旧調査

## 確認できた事実
- GitHub対象は承認済みの `jiruneko/shin-WritePilot`、ブランチは `feat/video-comprehension-quiz`。
- 正常動作コミット `1a1e155` と履歴保存コミット `d6281b5` を比較した。VideoQuizの削除、video_idの変更、既存quiz行のDELETE/UPDATEはない。
- 履歴マイグレーションは非公開クイズのUUID列追加と新規履歴テーブル・保存RPCを追加する。既存の `video_quiz` と視聴権限関数は変更しない。
- テストDBで昨日のマイグレーション適用後のクイズ行と、本日のマイグレーション適用後のvideo_id・questionsが完全一致することを検証。
- ページには昨日から、Storage署名URLが取得できなければクイズRPCを実行しない条件があり、PGRST202（RPC未検出）を非表示にする処理もあった。
- 本日の履歴問い合わせはエラー結果なら表示するが、例外を投げた場合はページ全体を失敗させる構造だった。

## 修正
- Storage署名URL取得の成否とクイズ取得を分離。既存の認証済み `video_quiz` RPCが公開状態・視聴権限をチェックするため、アクセス権限は緩めない。
- PGRST202を含む取得エラーを表示する。null/空配列なら未登録または受験権限なしと表示し、無言で消さない。
- 履歴取得の例外を捕捉し、クイズや再生まで巻き込まない。
- 回答後のサーバー採点・保存・履歴取得は維持。クイズデータの再生成・上書きは一切しない。DB変更SQLも追加しない。

## 未確認事項（Macへ接続できないため）
実際のブラウザコンソール/APIレスポンス、現在のGit HEAD・差分、ローカル環境変数、DBに残る動画とクイズ行、適用済みマイグレーション、現在のログインユーザーの受験権限は未確認。
このため、上記のコード上の不具合が今回の消失の直接原因だったとは断定しない。
会話中のログから、Docker停止で認証接続が失敗していたこと、別の `writepilot` と `writepilot-quiz-local` を起動していたことは確認済み。起動フォルダ・接続DBの取り違えも確認する。

## 最初にMacで確認（出力のキーやシークレットは共有しない）
```bash
cd /Users/nagatsukakenji/writepilot-quiz-local
pwd
git remote -v
git branch --show-current
git log -3 --oneline
git status --short
grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local
npx supabase status
npx supabase migration list --local
```
期待：対象ブランチ、接続URL `http://127.0.0.1:54321`、ローカルSupabase稼働。
未コミットのサムネイル修正などは保持する。

ローカルStudioのSQL Editorで `supabase/quiz_diagnostics_readonly.sql` を実行する。二つ目のブロックは必要テーブルが存在すると確認してから実行。
期待：対象動画の `quiz_exists=true`、`question_count=3`、公開済み・削除中でない。RPC2本のauthenticated_execute=true、anonymous_execute=false。履歴適用済みならhistory_tableとquiz_uuidが存在。
Studioは管理者権限なので、データ存在確認と本人のRLS通過は区別する。本人のRPC応答はログインした画面とサーバーログで確認する。
クイズが存在しなければ、再生成せず、上記出力と昨日使用していたDB・動画IDを照合する。

## 修正コードの取得
```bash
git pull --ff-only origin feat/video-comprehension-quiz
```
競合やブランチ違いがあれば止める。未コミット変更を破棄しない。
今回の表示修正には新規マイグレーションは不要。履歴マイグレーションが未適用の場合は、上記のデータ存在確認と未適用一覧の確認後に限り `npx supabase migration up --local` を実行する。クイズが欠けている状態では、原因確認前に11月10日のseed入りマイグレーションを再実行しない。

既存の3100番サーバーを元のターミナルでControl+Cしてから起動する。
```bash
npm run dev -- --hostname 127.0.0.1 --port 3100
```
http://127.0.0.1:3100/videos/52fb387f-e7b5-4b74-9b7e-264cd644d86d にログインして開く。別UUIDの環境なら診断SQLで見つかった既存動画UUIDを使用する。
1. 動画・サムネイル・3問が表示される。
2. 3問に回答し、得点・正答率・保存成功を確認する。
3. 再読み込みして履歴が残る。
4. 再受験で履歴が追加される。
5. 別ユーザーでは元ユーザーの履歴が見えない。
6. 取得できない場合は画面メッセージ、ブラウザConsole、ターミナルのエラーを記録する。Server ComponentのRPCはサーバーから実行されるため、ブラウザNetworkにSupabase直接通信が出ないことがある。

`supabase db reset`、本番DB操作、データ再生成、reset/force pushは使用しない。
