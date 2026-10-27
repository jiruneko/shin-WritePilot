"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeLesson, undoCompleteLesson } from "@/app/videos/actions";

export function CompleteLessonButton({ id, completed }: { id: string; completed: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(completed);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return <div className="mb-8">
    <button type="button" className="button-primary disabled:opacity-60" disabled={pending} onClick={() => {
      setError(undefined);
      startTransition(async () => {
        try {
          const result = current ? await undoCompleteLesson(id) : await completeLesson(id);
          if (!result.success) { setError(result.error || "変更を保存できませんでした。再試行してください。"); return; }
          setCurrent(!current);
          router.refresh();
        } catch { setError("通信に失敗しました。再試行してください。"); }
      });
    }}>{pending ? "保存中…" : current ? "完了を取り消す" : "学習を完了する"}</button>
    <p role="status" className="mt-3 text-sm text-slate-300">{current ? "この教材は学習完了済みです。" : "この教材は未完了です。"}</p>
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
  </div>;
}
