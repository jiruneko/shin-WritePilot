export type AuthState = { error?: string; success?: string };

export function credentials(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "正しいメールアドレスを入力してください。" } as const;
  }
  if (!password || password.length > 128) {
    return { error: "パスワードを入力してください（128文字以内）。" } as const;
  }
  return { email, password } as const;
}

export function registration(form: FormData) {
  const parsed = credentials(form);
  if (parsed.error) return parsed;
  if (parsed.password!.length < 12) {
    return { error: "パスワードは12文字以上で入力してください。" } as const;
  }
  if (parsed.password !== form.get("passwordConfirmation")) {
    return { error: "確認用パスワードが一致しません。" } as const;
  }
  return parsed;
}
