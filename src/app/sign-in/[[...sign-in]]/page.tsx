import { SignIn } from "@clerk/nextjs";
import { isClerkAuthEnabled } from "@/lib/auth-mode";

export default function SignInPage() {
  if (!isClerkAuthEnabled()) {
    return (
      <section className="mx-auto max-w-xl rounded border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-slate-900">ログインは無効です</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          現在の環境はローカルデモ認証で動作しています。Clerk を使う場合は
          BROKER_DESK_AUTH_MODE=clerk を設定してください。
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </section>
  );
}
