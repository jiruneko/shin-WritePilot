"use client";

import { useActionState } from "react";
import { login, signup, deleteAccount } from "@/app/auth/actions";
import type { AuthState } from "@/src/lib/auth/validation";

export function AuthForm({ mode }: { mode: "login" | "signup" | "delete" }) {
  const action = mode === "signup" ? signup : mode === "delete" ? deleteAccount : login;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const isSignup = mode === "signup";
  const isDelete = mode === "delete";
  const label = isSignup ? "新規登録" : isDelete ? "退会してアカウントを削除" : "ログイン";

  return (
    <form action={formAction} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        {!isDelete && <div>
          <label className="field-label" htmlFor={`${mode}-email`}>メールアドレス</label>
          <input className="field" id={`${mode}-email`} name="email" type="email" autoComplete="email" maxLength={254} required />
        </div>}
        <div>
          <label className="field-label" htmlFor={`${mode}-password`}>{isDelete ? "現在のパスワード" : "パスワード"}</label>
          <input className="field" id={`${mode}-password`} name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} minLength={isSignup ? 12 : undefined} maxLength={128} aria-describedby={isSignup ? "password-help" : undefined} required />
          {isSignup && <p id="password-help" className="mt-2 text-sm text-slate-400">12〜128文字で設定してください。</p>}
        </div>
        {isSignup && <div>
          <label className="field-label" htmlFor="password-confirmation">パスワード（確認）</label>
          <input className="field" id="password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        </div>}
        {isDelete && <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
          <input className="mt-1 h-5 w-5 shrink-0" type="checkbox" name="confirmation" value="delete" required />
          <span>アカウントが削除され、元に戻せないことを理解しました。</span>
        </label>}
        <button className={isDelete ? "button-danger w-full" : "button-primary w-full"} type="submit">{pending ? "処理中…" : label}</button>
      </fieldset>
      {state.error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-sm leading-6 text-red-200">{state.error}</p>}
      {state.success && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/40 p-4 text-sm leading-6 text-emerald-200">{state.success}</p>}
    </form>
  );
}
