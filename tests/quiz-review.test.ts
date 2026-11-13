import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { questionFeedback, analyzeWeakness } from "../src/lib/videos/quiz-feedback";
import { recommendReview } from "../src/lib/videos/quiz-review";
const sql = readFileSync("supabase/migrations/202611100001_video_comprehension_quiz.sql", "utf8");
const questions = JSON.parse(sql.split("select id, '")[1].split("'::jsonb")[0]);
describe("review recommendations", () => {
  it.each([[1,2,0],[1,2,1],[1,0,1],[0,0,1]])("recommends exactly the missed categories for %j", (...answers) => {
    const correct = answers.map((a,i) => a === [1,2,0][i]);
    const snapshot = {questions,answers,correct};
    const feedback = questionFeedback(questions,answers,correct);
    const review = recommendReview(feedback);
    expect(review.complete).toBe(correct.every(Boolean));
    expect(review.items.map(i=>i.title)).toEqual(feedback.filter(i=>!i.correct).map(i=>i.category));
    expect(review.items.every(i=>analyzeWeakness([snapshot]).find(a=>a.category===i.title)?.weak)).toBe(true);
    expect(recommendReview(questionFeedback(...[snapshot.questions,snapshot.answers,snapshot.correct]))).toEqual(review);
    expect(recommendReview(questionFeedback(...[JSON.parse(JSON.stringify(snapshot)).questions,answers,correct]))).toEqual(review);
  });
  it("handles incomplete metadata without inventing a category", () => {
    expect(recommendReview([]).complete).toBe(false);
    expect(recommendReview([{correct:false}]).items[0].title).toBe("問題1の内容");
    expect(recommendReview(questionFeedback(null,null,null)).items).toEqual([]);
  });
  it("groups categories and prioritizes lower accuracy with stable ties", () => {
    const result = recommendReview([{correct:false,category:"A"},{correct:true,category:"A"},{correct:false,category:"B"},{correct:false,category:"B"}]);
    expect(result.items.map(i=>i.title)).toEqual(["B","A"]);
    expect(result.items[0].reason).toContain("問題3・4");
  });
});
