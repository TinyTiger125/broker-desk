"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SupabaseForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
    } catch {
      // Keep the same response for unknown and known accounts.
    } finally {
      setSubmitted(true);
      setPending(false);
    }
  }

  if (submitted) {
    return <p role="status" className="border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-700">如果邮箱对应有效账户，密码重置邮件已发送。请检查收件箱。</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4 border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <label className="grid gap-2 text-sm font-bold text-slate-900">
        <span>邮箱</span>
        <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 border border-slate-300 px-3 font-normal outline-none focus:border-slate-950" />
      </label>
      <button type="submit" disabled={pending} className="min-h-11 border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? "…" : "发送重置邮件"}</button>
    </form>
  );
}
