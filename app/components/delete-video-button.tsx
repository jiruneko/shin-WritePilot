"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVideo } from "@/app/admin/videos/actions";
export function DeleteVideoButton({ id, title, retry }: { id: string; title: string; retry: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function remove() {
    setPending(true); setError("");
    try {
      const result = await deleteVideo(id, true);
      if (result.error) setError(result.error);
      else setConfirm(false);
      router.refresh();
    } catch { setError("通信に失敗しました。再試行してください。"); }
    finally { setPending(false); }
  }
  return <div>{!confirm ? <button className="button-danger" onClick={() => setConfirm(true)}>{retry ? "削除を再試行" : "削除"}</button> :
    <div className="space-y-3 rounded-xl border border-red-400/40 p-4"><p className="text-sm">「{title}」と動画ファイルを完全に削除します。取り消せません。</p><div className="flex flex-wrap gap-3"><button className="button-danger" disabled={pending} onClick={remove}>{pending ? "削除中…" : "完全に削除する"}</button><button className="button-secondary" disabled={pending} onClick={() => setConfirm(false)}>キャンセル</button></div></div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
  </div>;
}
