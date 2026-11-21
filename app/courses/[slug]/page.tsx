import Link from "next/link";
import { notFound } from "next/navigation";
import { LmsShell } from "@/app/components/lms-shell";
import { optionalProfile } from "@/src/lib/auth/profile";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();

  const { supabase, user, profile } = await optionalProfile();
  const { data: course, error } = await supabase.from("courses")
    .select("id,title,syllabus_version").eq("slug", slug).maybeSingle();
  if (error) throw new Error("コースを読み込めませんでした。");
  if (!course) notFound();

  const { data: lessons, error: lessonError } = await supabase.from("course_lessons")
    .select("position, videos!inner(id,title,access_level)")
    .eq("course_id", course.id)
    .order("position")
    .overrideTypes<{ position: number; videos: { id: string; title: string; access_level: "FREE" | "PAID" } }[], { merge: false }>();
  if (lessonError) throw new Error("講義一覧を読み込めませんでした。");

  return (
    <LmsShell title={course.title} admin={profile?.role === "ADMIN"} guest={!user}>
      <p className="mb-5 text-slate-300">{course.syllabus_version}</p>
      <h2 className="mb-3 text-xl font-semibold">受講できる講義</h2>
      {lessons.length ? (
        <ul className="space-y-3">
          {lessons.map(({ videos: video }) => (
            <li key={video.id}>
              <Link className="underline" href={`/videos/${video.id}`}>{video.title}</Link>
              {video.access_level === "FREE" && <span className="ml-3 text-sm text-sky-300">無料体験</span>}
            </li>
          ))}
        </ul>
      ) : <p>受講できる講義はまだありません。</p>}
    </LmsShell>
  );
}
