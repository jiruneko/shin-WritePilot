import { QuizReview } from "@/app/components/quiz-review";
import { questionFeedback } from "@/src/lib/videos/quiz-feedback";
import { analyzeWeakness } from "@/src/lib/videos/quiz-feedback";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAuthConfigured } from "@/src/lib/auth/user";
import { optionalProfile } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { VideoPlayer } from "@/app/components/video-player";
import { VIDEO_BUCKET, UUID } from "@/src/lib/videos/validation";
import { CompleteLessonButton } from "@/app/components/complete-lesson-button";
import { VideoQuiz, type QuizQuestion } from "@/app/components/video-quiz";
export const dynamic = "force-dynamic";
const TAIWAN_LESSON_ID = "8d1f8419-8285-4808-b229-b2651720909e";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return id === TAIWAN_LESSON_ID ? { title: "什麼是電腦？｜WritePilot" } : {};
}
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isAuthConfigured()) redirect("/login");
  const { user, profile, supabase } = await optionalProfile();
  const { id } = await params;
  const taiwan = id === TAIWAN_LESSON_ID;
  const t = (ja: string, zh: string) => taiwan ? zh : ja;
  if (!UUID.test(id)) notFound();
  const videoQuery = supabase.from("videos").select("*").eq("id", id).eq("is_deleting", false);
  if (!user) videoQuery.match({ access_level: "FREE", is_published: true });
  const { data: video, error } = await videoQuery.maybeSingle();
  if (error) throw new Error(t("動画を取得できませんでした。", "無法載入影片。"));
  if (!video && !user) redirect("/login");
  if (!video) notFound();
  // Session-scoped Storage client + RLS, never a service-role playback client.
  const { data, error: signingError } = video.storage_path
    ? await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path, 300)
    : { data: null, error: null };
  const { data: completion, error: completionError } = user ? await supabase.from("video_completions")
    .select("video_id").eq("user_id", user.id).eq("video_id", id).maybeSingle() : { data: null, error: null };
  if (completionError) throw new Error(t("学習完了の状態を取得できませんでした。再読み込みしてください。", "無法取得學習進度，請重新整理頁面。"));
  // Quiz access is decided by its authenticated RPC, independently of Storage signing.
  const { data: questions, error: quizError } = user && video.is_published
    ? await supabase.rpc("video_quiz", { lesson_id: id })
    : { data: null, error: null };
  // A history outage must not prevent the existing quiz from rendering.
  const historyResult = user ? await (async () => {
    try {
      return await supabase.from("video_quiz_attempts")
        .select("id,correct_count,question_count,percentage,taken_at,questions,answers,correct").eq("user_id", user.id).eq("video_id", id)
        .order("taken_at", { ascending: false }).limit(20);
    } catch {
      return { data: null, error: { code: "FETCH_ERROR", message: "history unavailable" } };
    }
  })() : { data: null, error: null };
  const { data: history, error: historyError } = historyResult;
  const analysis = analyzeWeakness(history ?? []);
  return <LmsShell taiwan={taiwan} title={video.title} admin={profile?.role === "ADMIN"} guest={!user}>
    {!video.is_published && <p className="mb-4 text-amber-200">{t("非公開動画の管理者プレビュー", "未公開影片的管理員預覽")}</p>}
    {video.is_sample && <p className="mb-4 text-amber-200">{t("サンプル教材：操作体験用のデモ映像です。正式な講義ではありません。", "示範教材：此影片供操作體驗使用。")}</p>}
    <div id="lesson-video" className="scroll-mt-4">
    {video.youtube_id && /^[A-Za-z0-9_-]{11}$/.test(video.youtube_id) ? <div>
      <iframe className="aspect-video w-full rounded-2xl border-0" src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}`} title={`${video.title}${t("のサンプル動画", "示範影片")}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      <p className="mt-3 text-sm text-slate-400">{t("再生できない場合は", "若無法播放，請")} <a className="underline" href={`https://www.youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer">{t("YouTubeで開く", "在 YouTube 上觀看")}</a>{t("。外部サービスの提供状況により視聴できない場合があります。", "。影片能否播放取決於 YouTube 的服務狀態。")}</p>
    </div> : signingError || !data ? <p role="alert" className="rounded-xl border border-red-400/30 p-5 text-red-200">{t("再生URLを取得できませんでした。時間をおいて再読み込みしてください。", "無法取得播放連結，請稍後重新整理頁面。")}</p> : <VideoPlayer taiwan={taiwan} src={data.signedUrl} id={id} />}
    </div>
    {video.storage_path && <p className="mt-3 text-sm text-slate-400">{t("再生が途切れた場合は再生URLを自動更新します。改善しない場合は「再生を再試行」を押してください。", "播放中斷時，系統會自動更新播放連結。若問題持續，請按「重新播放」。")}</p>}
    <p className="my-8 whitespace-pre-wrap break-words leading-8 text-slate-300">{video.description || t("説明はありません。", "目前沒有教材說明。")}</p>
    {!user && <Link href="/login" className="button-secondary">{t("ログインして学習を記録", "登入以記錄學習")}</Link>}
    {user && <>
    {video.is_published && <CompleteLessonButton taiwan={taiwan} key={`completion:${user.id}:${id}`} id={id} completed={!!completion} />}
    {Array.isArray(questions) && questions.length > 0 && <VideoQuiz taiwan={taiwan} key={`quiz:${user.id}:${id}`} id={id} questions={questions as QuizQuestion[]} />}
    {quizError && <p role="alert" className="mb-4 text-red-200">
      {quizError.code === "PGRST202"
        ? t("理解度テストを取得できません。接続先のクイズ機能が未適用、またはAPIに反映されていない可能性があります。", "理解度測驗尚未就緒，請稍後再試。")
        : t("理解度テストを取得できませんでした。再読み込みしてください。", "無法載入理解度測驗，請重新整理頁面。")}
    </p>}
    {video.is_published && !quizError && (!Array.isArray(questions) || questions.length === 0) && <p role="status" className="mb-4 text-amber-200">
      {t("この動画の理解度テストを取得できませんでした。テスト未登録、または受験権限がない可能性があります。", "無法載入此影片的理解度測驗。測驗可能尚未建立，或你的帳號沒有作答權限。")}
    </p>}
    <section className="mb-8" aria-label={t("弱点分析", "弱點分析")}>
      <h2 className="text-xl font-semibold">{t("分野別の学習状況", "各主題的學習表現")}</h2>
      <p>{t("この動画の最新20回の受験を集計しています。各分野の回答5件未満は参考値です。同じ問題の繰り返しを含み、理解度を保証するものではありません。", "以下統計本影片最近 20 次測驗。各主題作答未滿 5 題時，結果僅供參考。統計可能包含重複作答。")}</p>
      {historyError ? <p>{t("履歴を取得できないため、分析を表示できません。", "無法取得測驗紀錄，因此無法顯示分析。")}</p> : analysis.length === 0 ? <p>{t("分析できる回答はまだありません。テストに回答すると表示されます。カテゴリ未設定の問題は集計対象外です。", "目前沒有可分析的作答紀錄。完成測驗後即可查看分析，未分類的題目不列入統計。")}</p> : <ul>
        {analysis.map(item => <li key={item.category} className="mt-3 rounded-xl border border-slate-700 p-3">
          <p className="font-semibold">{item.category}：{item.percentage}%（{taiwan ? `共 ${item.total} 題，答對 ${item.correct} 題` : `${item.total}問中${item.correct}問正解`}）</p>
          <p>{item.weak ? t("復習するとよい分野です。", "建議複習這個主題。") : t("よくできています。", "這個主題掌握得很好。")} {item.provisional && t("回答が少ないため参考値です。苦手分野の判断は暫定です。", "目前作答次數較少，分析結果僅供參考。")}</p>
        </li>)}
      </ul>}
    </section>
    <section className="mb-8" aria-label={t("受験履歴", "測驗紀錄")}>
      <h2 className="text-xl font-semibold">{t("過去の受験履歴（最新20件）", "測驗紀錄（最近 20 筆）")}</h2>
      {historyError ? <p role="alert">{["PGRST205", "42P01"].includes(historyError.code)
        ? t("履歴保存機能のDB準備が完了していません。クイズの表示は利用できますが、回答の保存には管理者の対応が必要です。", "測驗紀錄功能尚未就緒，請聯絡管理員。")
        : t("履歴を取得できませんでした。ページを再読み込みしてください。", "無法載入測驗紀錄，請重新整理頁面。")}</p> :
        <ul>{history?.map(attempt => <li key={attempt.id}>
          {new Date(attempt.taken_at).toLocaleString(taiwan ? "zh-TW" : "ja-JP", { timeZone: taiwan ? "Asia/Taipei" : "Asia/Tokyo" })}：
          {taiwan ? `共 ${attempt.question_count} 題，答對 ${attempt.correct_count} 題` : `${attempt.question_count}問中${attempt.correct_count}問正解`}（{attempt.percentage}%）
          <details className="my-3 rounded-xl border border-slate-700 p-3">
            <summary className="cursor-pointer">{t("この受験の復習と解説を見る", "查看本次測驗的複習建議與解析")}</summary>
            <QuizReview taiwan={taiwan} feedback={questionFeedback(attempt.questions, attempt.answers, attempt.correct)} />
            <ol className="list-inside list-decimal space-y-2">
              {questionFeedback(attempt.questions, attempt.answers, attempt.correct).map((item, index) => <li key={index}>
                {taiwan ? `第 ${index + 1} 題` : `問題${index + 1}`}：{item.correct ? t("正解", "答對") : t("確認してみましょう", "答錯")}
                {!item.correct && <p>{t("正解", "正確答案")}：{item.answer ?? t("正解データは未設定です。", "尚未設定正確答案。")}</p>}
                <p>{item.explanation ?? t("解説は準備中です。", "解析準備中。")}</p>
              </li>)}
            </ol>
          </details>
        </li>)}</ul>}
      {!historyError && !history?.length && <p>{t("受験履歴はまだありません。", "目前沒有測驗紀錄。")}</p>}
    </section>
    </>}
    {user && <Link href="/videos" className="button-secondary">{t("動画一覧へ戻る", "返回影片列表")}</Link>}
  </LmsShell>;
}
