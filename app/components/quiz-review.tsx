import Link from "next/link";
import type { QuestionFeedback } from "../../src/lib/videos/quiz-feedback";
import { recommendReview } from "../../src/lib/videos/quiz-review";

export function QuizReview({ feedback }: { feedback: QuestionFeedback[] }) {
  const review = recommendReview(feedback);
  return <section aria-label="おすすめの復習" className="my-4 rounded-xl border border-slate-700 p-4 break-words">
    <h3 className="text-lg font-semibold">おすすめの復習</h3>
    <p className="mt-2">{review.message}</p>
    {!!review.items.length && <ol className="mt-3 list-inside list-decimal space-y-3">
      {review.items.map(item => <li key={item.index}>
        <span className="font-semibold">{item.title}</span>
        <p className="mt-1 text-sm text-slate-300">{item.reason}</p>
      </li>)}
    </ol>}
    <div className="mt-4 flex flex-wrap gap-3">
      {review.complete ? <Link href="/videos" className="button-secondary">次の教材を探す</Link>
        : <><a href="#lesson-video" className="button-secondary">この動画を見直す</a>
          <a href="#video-quiz-heading" className="button-secondary">理解度テストへ戻る</a></>}
    </div>
  </section>;
}
