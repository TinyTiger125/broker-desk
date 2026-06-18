import Link from "next/link";

export default function SignUpPage() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-slate-900">アカウント作成は招待制です</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Broker Desk は不動産会社・仲介担当者向けの席数制サービスです。新規アカウントはプラットフォーム管理者が発行します。
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white"
        >
          ログインへ
        </Link>
      </div>
    </section>
  );
}
