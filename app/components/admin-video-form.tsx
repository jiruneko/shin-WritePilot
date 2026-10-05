"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { prepareUpload, saveVideo } from "@/app/admin/videos/actions";
import { videoMetadata, validateFile, VIDEO_BUCKET, type Video } from "@/src/lib/videos/validation";
export function AdminVideoForm({ video }: { video?: Video }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState<{ id: string; path: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      videoMetadata(form);
      let id = video?.id ?? uploaded?.id;
      if (!id) {
        const file = form.get("file");
        if (!(file instanceof File)) throw new Error("動画を選択してください。");
        const invalid = validateFile(file);
        if (invalid) throw new Error(invalid);
        setMessage("アップロードを準備しています…");
        const ready = await prepareUpload({ name: file.name, size: file.size, type: file.type });
        if (ready.error || !ready.id || !ready.path) throw new Error(ready.error || "準備できませんでした。");
        setMessage("動画をアップロードしています。この画面を閉じずにお待ちください…");
        const { error: uploadError } = await createClient().storage.from(VIDEO_BUCKET).upload(ready.path, file, { contentType: "video/mp4", upsert: false, cacheControl: "0" });
        if (uploadError) throw new Error("アップロードできませんでした。管理者権限・ファイル形式・サイズ・通信状態を確認してください。");
        id = ready.id;
        setUploaded({ id, path: ready.path });
      }
      setMessage("動画情報を保存しています…");
      form.delete("file");
      const result = await saveVideo(id, form, !video);
      if (result.error) throw new Error(result.error);
      router.push("/admin/videos"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。"); }
    finally { setPending(false); setMessage(""); }
  }
  return <form onSubmit={submit} className="max-w-2xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-8">
    <fieldset disabled={pending || video?.is_deleting} className="space-y-6 disabled:opacity-60">
      <div><label htmlFor="title" className="field-label">タイトル</label><input id="title" name="title" className="field" maxLength={200} defaultValue={video?.title} required /></div>
      <div><label htmlFor="description" className="field-label">説明</label><textarea id="description" name="description" className="field" rows={6} maxLength={10000} defaultValue={video?.description} /></div>
      {!video && <div><label htmlFor="file" className="field-label">動画ファイル（MP4・50MiB以下）</label><input id="file" name="file" className="field" type="file" accept="video/mp4,.mp4" required={!uploaded} disabled={!!uploaded} /><p className="mt-2 text-sm text-slate-400">再生互換性のためH.264映像・AAC音声を推奨します。</p></div>}
      <div><label htmlFor="thumbnail" className="field-label">サムネイル画像URL（任意・HTTPS）</label><input id="thumbnail" name="thumbnail_url" type="url" className="field" maxLength={2048} defaultValue={video?.thumbnail_url ?? ""} /></div>
      <label className="flex items-center gap-3"><input type="checkbox" name="is_published" className="h-5 w-5" defaultChecked={video?.is_published} />公開する</label>
      <button type="submit" className="button-primary">{pending ? "処理中…" : uploaded ? "動画情報の保存を再試行" : "保存する"}</button>
    </fieldset>
    {message && <p role="status" className="text-sm text-sky-200">{message}</p>}
    {uploaded && <p className="break-all text-sm text-slate-400">ファイル送信済み。保存が失敗した場合はこの画面で再試行してください。保存先：{uploaded.path}</p>}
    {video?.is_deleting && <p role="alert">削除処理中です。動画一覧から削除を再試行してください。</p>}
    {error && <p role="alert" className="text-sm leading-6 text-red-200">{error}</p>}
  </form>;
}
