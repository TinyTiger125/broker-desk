import Link from "next/link";
import { SupabaseForgotPasswordForm } from "@/components/supabase-forgot-password-form";
import { isSupabaseAuthEnabled } from "@/lib/auth-mode";

export default function ForgotPasswordPage() {
  if (!isSupabaseAuthEnabled()) return <main className="mx-auto max-w-xl px-6 py-16"><p>登录服务尚未配置。</p></main>;
  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center gap-6 px-6 py-12">
      <div><p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">Broker Desk</p><h1 className="mt-3 text-3xl font-black text-slate-950">重置密码</h1><p className="mt-3 text-sm leading-6 text-slate-600">输入受邀请的邮箱。无论账户是否存在，我们都会显示相同结果。</p></div>
      <SupabaseForgotPasswordForm />
      <Link href="/sign-in" className="text-sm font-bold text-[#1960a3] underline">返回登录</Link>
    </main>
  );
}
