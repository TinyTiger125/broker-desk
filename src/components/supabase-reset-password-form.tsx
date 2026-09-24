"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SupabaseResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password !== confirmation) { setMessage("密码至少需要 8 位，且两次输入必须一致。"); return; }
    setPending(true); setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
      if (error) throw error;
      setMessage("密码已更新，请重新登录。");
      window.setTimeout(() => router.replace("/sign-in"), 600);
    } catch { setMessage("密码更新失败，请重新打开邮件后再试。"); }
    finally { setPending(false); }
  }

  return <form onSubmit={submit} className="grid gap-4 border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <label className="grid gap-2 text-sm font-bold"><span>新密码</span><input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 border border-slate-300 px-3 font-normal" /></label>
    <label className="grid gap-2 text-sm font-bold"><span>确认新密码</span><input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 border border-slate-300 px-3 font-normal" /></label>
    {message ? <p role="status" className="text-sm font-bold text-slate-700">{message}</p> : null}
    <button disabled={pending} className="min-h-11 border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? "…" : "更新密码"}</button>
  </form>;
}
