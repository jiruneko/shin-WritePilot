"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeLesson, undoCompleteLesson } from "@/app/videos/actions";

export function CompleteLessonButton({ id, completed, taiwan = false }: { id: string; completed: boolean; taiwan?: boolean }) {
  const t = (ja: string, zh: string) => taiwan ? zh : ja;
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
          if (!result.success) { setError((!taiwan && result.error) || t("変更を保存できませんでした。再試行してください。", "無法儲存變更，請再試一次。")); return; }
          setCurrent(!current);
          router.refresh();
        } catch { setError(t("通信に失敗しました。再試行してください。", "連線失敗，請再試一次。")); }
      });
    }}>{pending ? t("保存中…", "儲存中…") : current ? t("完了を取り消す", "取消完成標記") : t("学習を完了する", "標記為已完成")}</button>
    <p role="status" className="mt-3 text-sm text-slate-300">{current ? t("この教材は学習完了済みです。", "你已完成這個教材。") : t("この教材は未完了です。", "你尚未完成這個教材。")}</p>
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
  </div>;
}
