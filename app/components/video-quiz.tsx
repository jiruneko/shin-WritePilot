"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { submitVideoQuiz } from "@/app/videos/actions";

export type QuizQuestion = { prompt: string; options: string[] };

export function VideoQuiz({ id, questions }: { id: string; questions: QuizQuestion[] }) {
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
        setResult({ error: "通信に失敗しました。再試行してください。" });
      } finally { submitting.current = false; }
    });
  }

  return <section aria-labelledby="video-quiz-heading" className="mb-8 rounded-2xl border border-slate-700 p-5">
    <h2 id="video-quiz-heading" className="mb-4 text-xl font-semibold">理解度テスト</h2>
    <form onSubmit={submit} onChange={() => setResult(undefined)}>
      {questions.map((question, index) => <fieldset key={index} disabled={pending || !!result?.saved} className="mb-5">
        <legend className="mb-2 font-medium">{index + 1}. {question.prompt}</legend>
        {question.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2 py-1">
          <input type="radio" name={`question-${index}`} value={optionIndex} required />
          {option}
        </label>)}
      </fieldset>)}
      <button type="submit" disabled={pending || !!result?.saved} className="button-primary disabled:opacity-60">
        {pending ? "採点・保存中…" : result?.saved ? "保存済み" : result?.error ? "同じ回答で再試行する" : "回答を提出する"}
      </button>
    </form>
    {result?.error && <p role="alert" className="mt-3 text-red-300">{result.error}</p>}
    {result?.correct && <div role="status" className="mt-4">
      <p className="font-semibold">{questions.length}問中{result.score}問正解</p>
      <p>正答率：{result.percentage}% ／ 学習履歴を保存しました。</p>
      <button type="button" className="button-secondary mt-3" onClick={() => { submission.current = null; setResult(undefined); }}>もう一度受験する</button>
      <ol className="mt-2 list-inside list-decimal">
        {result.correct.map((correct, index) => <li key={index}>{correct ? "正解" : "不正解"}</li>)}
      </ol>
    </div>}
  </section>;
}
