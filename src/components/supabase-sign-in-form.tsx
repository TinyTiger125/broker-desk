"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SupabaseSignInForm({
  emailLabel,
  passwordLabel,
  submitLabel,
  errorLabel,
}: {
  emailLabel: string;
  passwordLabel: string;
  submitLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        setError(errorLabel);
        return;
      }
      router.replace("/workspace");
      router.refresh();
    } catch {
      setError(errorLabel);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid w-full gap-4 border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <label className="grid gap-2 text-sm font-bold text-slate-900">
        <span>{emailLabel}</span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-11 border border-slate-300 px-3 font-normal outline-none focus:border-slate-950"
        />
      </label>
      <label className="grid gap-2 text-sm font-bold text-slate-900">
        <span>{passwordLabel}</span>
        <input
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-h-11 border border-slate-300 px-3 font-normal outline-none focus:border-slate-950"
        />
      </label>
      {error ? <p role="alert" className="text-sm font-bold text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "…" : submitLabel}
      </button>
    </form>
  );
}
