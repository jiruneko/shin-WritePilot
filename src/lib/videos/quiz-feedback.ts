// Server-side callers only. Never send this catalog with unanswered questions.
const catalog = [
  { prompt: "コンピュータが情報を処理する基本的な流れはどれですか？", options: ["出力 → 処理 → 入力", "入力 → 処理 → 出力", "処理 → 出力 → 入力"], answer: 1, category: "情報処理の流れ", explanation: "コンピュータは、入力された情報を処理して、その結果を出力します。文字を入力し、計算や編集を行い、画面に表示する流れを思い浮かべましょう。" },
  { prompt: "文字を入力するとき、入力装置として使うものはどれですか？", options: ["ディスプレイ", "スピーカー", "キーボード"], answer: 2, category: "入力装置", explanation: "キーボードは文字や命令をコンピュータに伝える入力装置です。ディスプレイとスピーカーは、処理結果を人に伝える出力装置です。" },
  { prompt: "コンピュータが処理した結果を紙に出す装置はどれですか？", options: ["プリンター", "マウス", "マイク"], answer: 0, category: "出力装置", explanation: "プリンターは処理結果を紙に印刷する出力装置です。マウスやマイクは、操作や音声を取り込む入力装置です。" },
];
export type QuestionFeedback = { correct: boolean; category?: string; answer?: string; explanation?: string };
export type CategoryAnalysis = { category: string; total: number; correct: number; percentage: number; provisional: boolean; weak: boolean };
export function questionFeedback(questions: unknown, answers: unknown, correct: unknown): QuestionFeedback[] {
  if (!Array.isArray(questions) || !Array.isArray(answers) || !Array.isArray(correct)
    || questions.length !== answers.length || questions.length !== correct.length
    || !answers.every(answer => Number.isInteger(answer) && answer >= 0)
    || !correct.every(value => typeof value === "boolean")) return [];
  return questions.flatMap((question, index) => {
    if (typeof correct[index] !== "boolean" || !Number.isInteger(answers[index])) return [];
    const entry = catalog.find(item => question?.prompt === item.prompt && JSON.stringify(question?.options) === JSON.stringify(item.options));
    // A changed answer key must not produce a misleading explanation for an old attempt.
    if (!entry || (answers[index] === entry.answer) !== correct[index]) return [{ correct: correct[index] }];
    return [{ correct: correct[index], category: entry.category, answer: entry.options[entry.answer], explanation: entry.explanation }];
  });
}
export function analyzeWeakness(attempts: { questions: unknown; answers: unknown; correct: unknown }[]): CategoryAnalysis[] {
  const categories = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) for (const item of questionFeedback(attempt.questions, attempt.answers, attempt.correct)) {
    if (!item.category) continue;
    const count = categories.get(item.category) ?? { total: 0, correct: 0 };
    count.total++; if (item.correct) count.correct++;
    categories.set(item.category, count);
  }
  return [...categories].map(([category, count]) => ({ category, ...count,
    percentage: Math.round(count.correct * 100 / count.total), provisional: count.total < 5,
    weak: count.correct / count.total < 0.7,
  })).sort((a,b) => a.percentage - b.percentage || a.category.localeCompare(b.category, "ja"));
}
