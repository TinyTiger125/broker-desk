import Link from "next/link";
import { SupabaseResetPasswordForm } from "@/components/supabase-reset-password-form";
import { isSupabaseAuthEnabled } from "@/lib/auth-mode";

export default function ResetPasswordPage() {
  if (!isSupabaseAuthEnabled()) return <main className="mx-auto max-w-xl px-6 py-16"><p>登录服务尚未配置。</p></main>;
  return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-6 px-6 py-12"><div><p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">Broker Desk</p><h1 className="mt-3 text-3xl font-black text-slate-950">设置新密码</h1></div><SupabaseResetPasswordForm /><Link href="/sign-in" className="text-sm font-bold text-[#1960a3] underline">返回登录</Link></main>;
}
