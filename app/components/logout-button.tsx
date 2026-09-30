"use client";

import { useFormStatus } from "react-dom";
import { logout } from "@/app/auth/actions";

function Button() {
  const { pending } = useFormStatus();
  return <button className="button-secondary" disabled={pending} type="submit">{pending ? "ログアウト中…" : "ログアウト"}</button>;
}
export function LogoutButton() {
  return <form action={logout}><Button /></form>;
}
