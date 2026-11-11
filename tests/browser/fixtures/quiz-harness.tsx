// Test-only entry: the actual production component and stylesheet, no app route.
import React from "react";
import { createRoot } from "react-dom/client";
import { VideoQuiz } from "../../../app/components/video-quiz";
import "../../../app/globals.css";
const questions = [
  { prompt: "コンピュータの基本的な流れは？", options: ["出力→処理→入力", "入力→処理→出力", "処理→出力→入力"] },
  { prompt: "文字を入力する装置は？", options: ["画面", "スピーカー", "キーボード"] },
  { prompt: "紙に出力する装置は？", options: ["プリンター", "マウス", "マイク"] },
];
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-3xl p-4">
  <VideoQuiz id="82a67985-5b31-4d1f-9eb6-06e09748a315" questions={questions} />
</main>);
