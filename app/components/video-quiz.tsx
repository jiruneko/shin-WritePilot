"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { QuizReview } from "./quiz-review";
import { submitVideoQuiz } from "@/app/videos/actions";

export type QuizQuestion = { prompt: string; options: string[] };

export function VideoQuiz({ id, questions, taiwan = false }: { id: string; questions: QuizQuestion[]; taiwan?: boolean }) {
  const t = (ja: string, zh: string) => taiwan ? zh : ja;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitVideoQuiz>>>();

  const submission = useRef<{ id: string; answers: number[] } | null>(null);
  const submitting = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const answers = questions.map((_, index) => Number(form.get(`question-${index}`) ?? -1));
    if (!submission.current || JSON.stringify(submission.current.answers) !== JSON.stringify(answers)) {
      submission.current = { id: crypto.randomUUID(), answers };
    }
    const requestId = submission.current.id;
    submitting.current = true;
    setResult(undefined);
    startTransition(async () => {
      try {
        setResult(await submitVideoQuiz(id, answers, requestId));
      } catch {
        setResult({ error: t("通信に失敗しました。再試行してください。", "連線失敗，請再試一次。") });
      } finally { submitting.current = false; }
    });
  }

  return <section aria-labelledby="video-quiz-heading" className="mb-8 rounded-2xl border border-slate-700 p-5">
    <h2 id="video-quiz-heading" className="mb-4 text-xl font-semibold">{t("理解度テスト", "理解度測驗")}</h2>
    <form onSubmit={submit} onChange={() => setResult(undefined)}>
      {questions.map((question, index) => <fieldset key={index} disabled={pending || !!result?.saved} className="mb-5">
        <legend className="mb-2 font-medium">{index + 1}. {question.prompt}</legend>
        {question.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2 py-1">
          <input type="radio" name={`question-${index}`} value={optionIndex} required />
          {option}
        </label>)}
      </fieldset>)}
      <button type="submit" disabled={pending || !!result?.saved} className="button-primary disabled:opacity-60">
        {pending ? t("採点・保存中…", "正在批改並儲存…") : result?.saved ? t("保存済み", "已儲存") : result?.error ? t("同じ回答で再試行する", "以相同答案重試") : t("回答を提出する", "送出答案")}
      </button>
    </form>
    {result?.error && <p role="alert" className="mt-3 text-red-300">{taiwan ? "無法送出答案，請再試一次。" : result.error}</p>}
    {result?.correct && <div role="status" className="mt-4">
      <p className="font-semibold">{taiwan ? `共 ${questions.length} 題，答對 ${result.score} 題` : `${questions.length}問中${result.score}問正解`}</p>
      <p>{t("正答率", "答對率")}：{result.percentage}% ／ {t("学習履歴を保存しました。", "學習紀錄已儲存。")}</p>
      <button type="button" className="button-secondary mt-3" onClick={() => { submission.current = null; setResult(undefined); }}>{t("もう一度受験する", "再測驗一次")}</button>
      <QuizReview taiwan={taiwan} feedback={result.feedback ?? []} />
      <ol className="mt-2 list-inside list-decimal">
        {result.correct.map((correct, index) => <li key={index}>{correct ? t("正解", "答對") : t("不正解", "答錯")}
          {result.feedback?.[index]?.category && <span>（{result.feedback[index].category}）</span>}
          {!correct && <p>{t("正解", "正確答案")}：{result.feedback?.[index]?.answer ?? t("正解データは未設定です。", "尚未設定正確答案。")}</p>}
          {correct ? <details><summary>{t("解説を見る", "查看解析")}</summary><p>{result.feedback?.[index]?.explanation ?? t("解説は準備中です。", "解析準備中。")}</p></details>
            : <p>{result.feedback?.[index]?.explanation ?? t("解説は準備中です。", "解析準備中。")}</p>}
        </li>)}
      </ol>
    </div>}
  </section>;
}
