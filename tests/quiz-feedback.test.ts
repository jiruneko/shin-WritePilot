import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeWeakness, questionFeedback } from "../src/lib/videos/quiz-feedback";
const sql = readFileSync("supabase/migrations/202611100001_video_comprehension_quiz.sql", "utf8");
const questions = JSON.parse(sql.split("select id, '")[1].split("'::jsonb")[0]);
const attempt = (correct: boolean[], answers = [1,2,0]) => ({ questions, answers, correct });
describe("quiz feedback and rule-based analysis", () => {
  it("returns explanations and correct answers for all known questions", () => {
    const feedback = questionFeedback(questions, [0,0,1], [false,false,false]);
    expect(feedback.map(item => item.answer)).toEqual(["入力 → 処理 → 出力", "キーボード", "プリンター"]);
    expect(feedback.every(item => item.explanation && item.category)).toBe(true);
  });
  it("handles missing, edited and mismatched metadata safely", () => {
    expect(questionFeedback(null, null, null)).toEqual([]);
    expect(questionFeedback([{prompt:"unknown",options:[]}], [0], [false])).toEqual([{correct:false}]);
    expect(questionFeedback(questions, [0,0,1], [true,true,true]).every(item => !item.answer)).toBe(true);
    expect(analyzeWeakness([{questions:null,answers:null,correct:null}])).toEqual([]);
  });
  it("does not analyze unanswered attempts", () => {
    expect(analyzeWeakness([])).toEqual([]);
    expect(analyzeWeakness([{questions,answers:[],correct:[]}])).toEqual([]);
  });
  it("handles all correct and all incorrect results and flags limited evidence", () => {
    expect(analyzeWeakness([attempt([true,true,true])]).every(item => item.percentage === 100 && !item.weak && item.provisional)).toBe(true);
    expect(analyzeWeakness([attempt([false,false,false],[0,0,1])]).every(item => item.percentage === 0 && item.weak && item.provisional)).toBe(true);
  });
  it("aggregates correct counts per category and marks five observations", () => {
    const results=analyzeWeakness([attempt([false,true,true],[0,2,0]), ...Array.from({length:4},()=>attempt([true,true,true]))]);
    expect(results.find(item=>item.category === "情報処理の流れ")).toMatchObject({total:5,correct:4,percentage:80,provisional:false,weak:false});
  });
});

describe("final QA boundaries", () => {
  it("does not shift later explanations into a missing answer slot", () => {
    expect(questionFeedback(questions, [null,2,0], [false,true,true])).toEqual([]);
    expect(questionFeedback(questions, [1,2], [true,true,true])).toEqual([]);
  });
  it("marks below 70 percent weak and exactly 70 percent non-weak", () => {
    for (const count of [6,7]) {
      const rows=Array.from({length:10},(_,index)=> index<count ? attempt([true,true,true]) : attempt([false,false,false],[0,0,1]));
      expect(analyzeWeakness(rows).every(item=>item.percentage===count*10 && item.weak===(count<7) && !item.provisional)).toBe(true);
    }
  });
  it("leaves edited question options unclassified", () => {
    const edited=structuredClone(questions); edited[0].options.reverse();
    expect(questionFeedback(edited,[1,2,0],[true,true,true])[0]).toEqual({correct:true});
  });
});
