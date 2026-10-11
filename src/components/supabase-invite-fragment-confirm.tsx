"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";

type InviteState = "loading" | "ready" | "submitting" | "invalid" | "failed";

type Copy = {
  title: string;
  description: string;
  action: string;
  submitting: string;
  invalid: string;
  failed: string;
};

const copyByLocale: Record<Locale, Copy> = {
  ja: {
    title: "招待を確認",
    description: "招待を確認して、パスワード設定へ進みます。",
    action: "招待を確認して続ける",
    submitting: "確認しています…",
    invalid: "この招待リンクは無効か、すでに使用されています。管理者に新しいリンクを依頼してください。",
    failed: "招待を確認できませんでした。リンクの有効期限を確認し、管理者にお問い合わせください。",
  },
  zh: {
    title: "确认邀请",
    description: "确认邀请后即可设置密码。",
    action: "确认邀请并继续",
    submitting: "正在确认…",
    invalid: "此邀请链接无效或已使用。请联系管理员获取新链接。",
    failed: "无法确认邀请。请检查链接是否过期，并联系管理员。",
  },
  ko: {
    title: "초대 확인",
    description: "초대를 확인한 뒤 비밀번호를 설정합니다.",
    action: "초대를 확인하고 계속",
    submitting: "확인 중…",
    invalid: "초대 링크가 유효하지 않거나 이미 사용되었습니다. 관리자에게 새 링크를 요청하세요.",
    failed: "초대를 확인하지 못했습니다. 링크 만료 여부를 확인하고 관리자에게 문의하세요.",
  },
};

function readInviteFragment() {
  const rawHash = window.location.hash;
  const fragment = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const params = new URLSearchParams(fragment);
  const tokenHashes = params.getAll("token_hash");
  const types = params.getAll("type");
  const nextValues = params.getAll("next");
  const tokenHash = tokenHashes[0] ?? "";
  if (
    tokenHashes.length !== 1
    || !tokenHash
    || tokenHash !== tokenHash.trim()
    || types.length !== 1
    || types[0] !== "invite"
    || nextValues.length > 1
  ) {
    return null;
  }
  return { tokenHash, next: nextValues[0] ?? "/reset-password" };
}

function isSafeLocalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\r\n]/.test(value);
}

export function SupabaseInviteFragmentConfirm({ locale }: { locale: Locale }) {
  const copy = copyByLocale[locale];
  const tokenRef = useRef<string | null>(null);
  const nextRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const initializedRef = useRef(false);
  const clearScheduledRef = useRef(false);
  const [state, setState] = useState<InviteState>("loading");

  useEffect(() => {
    mountedRef.current = true;
    clearScheduledRef.current = false;
    if (initializedRef.current) {
      // React StrictMode replays effects after running their cleanup. The
      // first setup already consumed the fragment, so keep its in-memory
      // invitation for the replay instead of treating the empty hash as bad.
      setState(tokenRef.current ? "ready" : "invalid");
      return () => {
        mountedRef.current = false;
        clearScheduledRef.current = true;
        queueMicrotask(() => {
          if (!clearScheduledRef.current) return;
          tokenRef.current = null;
          nextRef.current = null;
        });
      };
    }
    initializedRef.current = true;
    // Remove the fragment before any provider call. The raw one-time secret is
    // held only in these refs and is never rendered or written to web storage.
    const invitation = readInviteFragment();
    window.history.replaceState(null, document.title, window.location.pathname);
    if (invitation) {
      tokenRef.current = invitation.tokenHash;
      nextRef.current = invitation.next;
      setState("ready");
    } else {
      tokenRef.current = null;
      nextRef.current = null;
      setState("invalid");
    }
    return () => {
      mountedRef.current = false;
      clearScheduledRef.current = true;
      queueMicrotask(() => {
        if (!clearScheduledRef.current) return;
        tokenRef.current = null;
        nextRef.current = null;
      });
    };
  }, []);

  async function confirmInvite() {
    const tokenHash = tokenRef.current;
    if (!tokenHash || state !== "ready") return;
    const next = nextRef.current;
    // Consume the in-memory copy before starting the request so a second click
    // or a retry cannot submit the same one-time token blindly.
    tokenRef.current = null;
    nextRef.current = null;
    setState("submitting");
    try {
      const response = await fetch("/auth/confirm", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type: "invite", next }),
      });
      const result = await response.json().catch(() => null) as { ok?: unknown; redirectTo?: unknown } | null;
      if (
        !response.ok
        || result?.ok !== true
        || typeof result.redirectTo !== "string"
        || !isSafeLocalPath(result.redirectTo)
      ) {
        throw new Error("invite_confirmation_failed");
      }
      if (mountedRef.current) window.location.replace(result.redirectTo);
    } catch {
      if (mountedRef.current) setState("failed");
    }
  }

  return (
    <main className="broker-desk-auth-route flex min-h-screen w-full items-center justify-center bg-[#f8f9ff] px-5 py-10 sm:px-8">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:p-10">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">Broker Desk</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.description}</p>
        <div aria-live="polite" className="mt-7">
          {state === "loading" && <p className="text-sm text-slate-600">{copy.submitting}</p>}
          {state === "invalid" && <p className="text-sm leading-6 text-rose-700">{copy.invalid}</p>}
          {state === "failed" && <p className="text-sm leading-6 text-rose-700">{copy.failed}</p>}
          {state === "ready" && (
            <button
              type="button"
              onClick={confirmInvite}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1960a3] px-5 py-3 text-sm font-black text-white transition hover:bg-[#124875] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1960a3]"
            >
              {copy.action}
            </button>
          )}
          {state === "submitting" && <p className="text-sm text-slate-600">{copy.submitting}</p>}
        </div>
      </section>
    </main>
  );
}
