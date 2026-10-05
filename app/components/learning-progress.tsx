export function LearningProgress({ total, completed, percent }: { total: number; completed: number; percent: number }) {
  return <section aria-label="学習進捗" className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
    <h2 className="text-lg font-semibold">学習進捗</h2>
    <p className="mt-2 text-slate-300">{total}教材中{completed}教材完了 <span className="ml-3 font-semibold text-sky-300">{percent}%</span></p>
    <p className="mt-2 text-sm text-slate-400">現在公開中の教材に対する進捗です。</p>
  </section>;
}
