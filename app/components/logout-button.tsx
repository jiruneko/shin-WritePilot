"use client";

import { useFormStatus } from "react-dom";
import { logout } from "@/app/auth/actions";

function Button({ taiwan }: { taiwan: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button-secondary" disabled={pending} type="submit">{pending ? (taiwan ? "登出中…" : "ログアウト中…") : (taiwan ? "登出" : "ログアウト")}</button>;
}
export function LogoutButton({ taiwan = false }: { taiwan?: boolean } = {}) {
  return <form action={logout}><Button taiwan={taiwan} /></form>;
}
