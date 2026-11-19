"use client";
import { useRef, useState } from "react";
import { renewPlayback } from "@/app/videos/actions";
export function VideoPlayer({ src, id, taiwan = false }: { src: string; id: string; taiwan?: boolean }) {
  const t = (ja: string, zh: string) => taiwan ? zh : ja;
  const player = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const wasPlaying = useRef(false);
  const recovering = useRef(false);
  const autoRetried = useRef(false);
  const [url, setUrl] = useState(src);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function recover() {
    if (recovering.current) return;
    recovering.current = true; setPending(true); setError("");
    try {
      const result = await renewPlayback(id);
      if (!result.url) { setError((!taiwan ? result.error : undefined) ?? t("再生できませんでした。", "無法播放影片。")); return; }
      setUrl(result.url);
      // load() also handles a retry receiving the same signed URL within one second.
      if (player.current) { player.current.src = result.url; player.current.load(); }
    } catch { setError(t("通信に失敗しました。", "連線失敗。")); }
    finally { recovering.current = false; setPending(false); }
  }
  return <div><video ref={player} className="aspect-video w-full rounded-2xl bg-black" src={url} controls playsInline preload="metadata"
    onTimeUpdate={() => { if (player.current && player.current.currentTime > 0) position.current = player.current.currentTime; }}
    onPlay={() => { wasPlaying.current = true; }}
    onPause={() => { if (!player.current?.error) wasPlaying.current = false; }}
    onLoadedMetadata={() => {
      if (player.current && position.current > 0) {
        player.current.currentTime = position.current;
        if (wasPlaying.current) void player.current.play().catch(() => undefined);
      }
    }}
    onPlaying={() => { autoRetried.current = false; }}
    onError={() => {
      if (!autoRetried.current) { autoRetried.current = true; void recover(); }
      else setError(t("再生できませんでした。通信状態や動画形式を確認してください。", "無法播放影片，請確認網路連線與影片格式。"));
    }}>{t("動画の再生に対応したブラウザーをお使いください。", "請使用支援影片播放的瀏覽器。")}</video>
    {pending && <p role="status" className="mt-4 text-sky-200">{t("再生URLを更新しています…", "正在更新播放連結…")}</p>}
    {error && <div className="mt-4 space-y-3"><p role="alert" className="text-red-200">{error}</p><button className="button-secondary" disabled={pending} onClick={() => { autoRetried.current = true; void recover(); }}>{t("再生を再試行", "重新播放")}</button></div>}
  </div>;
}
