import type { QuestionFeedback } from "./quiz-feedback";

// Only uses post-submission feedback. No answer catalog is bundled in the client.
export function recommendReview(feedback: QuestionFeedback[]) {
  if (!feedback.length) return { message: "復習項目を特定できませんでした。動画と解説を確認してから、もう一度試してみましょう。", items: [], complete: false };
  const missed = feedback.map((item, index) => ({ ...item, index })).filter(item => !item.correct);
  if (!missed.length) return { message: "よく理解できています。次の学習に進んでみましょう。復習は必要なときに戻れます。", items: [], complete: true };
  // Match the existing weakness analysis: lowest category accuracy first, ties by first question.
  const counts = new Map<string, { total: number; correct: number }>();
  for (const item of feedback) if (item.category) {
    const count = counts.get(item.category) ?? { total: 0, correct: 0 };
    count.total++; if (item.correct) count.correct++;
    counts.set(item.category, count);
  }
  const seen = new Set<string>();
  const items = missed.filter(item => {
    const key = item.category ?? `question-${item.index}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(item => {
    const count = item.category ? counts.get(item.category) : undefined;
    const percentage = count ? Math.round(count.correct * 100 / count.total) : 0;
    const numbers = missed.filter(other => item.category ? other.category === item.category : other.index === item.index).map(other => other.index + 1);
    return { title: item.category ?? `問題${item.index + 1}の内容`, percentage,
      reason: `問題${numbers.join("・")}で確認した内容です。` + (count ? `この受験の分野別正答率は${percentage}%です（参考値）。` : "分野が未設定のため、動画全体を確認しましょう。"),
      index: item.index };
  }).sort((a, b) => a.percentage - b.percentage || a.index - b.index);
  return { message: missed.length === feedback.length
    ? "動画を見ながら、基礎から一つずつ確認してみましょう。下の誤答解説も読み直せます。"
    : "理解できた部分を大切にしながら、次の項目を優先して復習してみましょう。",
    items, complete: false };
}
