"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeLesson } from "@/app/videos/actions";

export function CompleteLessonButton({ id, completed }: { id: string; completed: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const done = completed || saved;
  return <div className="mb-8">
    <button type="button" className="button-primary disabled:opacity-60" disabled={pending || done} onClick={() => {
      setError(undefined);
      startTransition(async () => {
        try {
          const result = await completeLesson(id);
          if (!result.success) { setError(result.error || "保存できませんでした。再試行してください。"); return; }
          setSaved(true);
          router.refresh();
        } catch { setError("通信に失敗しました。再試行してください。"); }
      });
    }}>{done ? "学習完了済み" : pending ? "保存中…" : "学習を完了する"}</button>
    {done && <p role="status" className="mt-3 text-emerald-300">この教材の学習完了を記録しました。</p>}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
  </div>;
}
