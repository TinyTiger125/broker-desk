import Link from "next/link";
import { getLocale, type Locale } from "@/lib/locale";

function copy(locale: Locale) {
  if (locale === "zh") {
    return {
      eyebrow: "Broker Desk",
      title: "邀请制访问",
      description: "Broker Desk 面向已开通席位的房地产经纪团队使用。账号由贵公司的管理员创建并发送邀请。",
      action: "前往登录",
    };
  }
  if (locale === "ko") {
    return {
      eyebrow: "Broker Desk",
      title: "초대 전용 접근",
      description: "Broker Desk는 좌석이 개설된 부동산 중개 팀을 위한 서비스입니다. 회사 관리자가 계정을 만들고 초대를 보냅니다.",
      action: "로그인으로 이동",
    };
  }
  return {
    eyebrow: "Broker Desk",
    title: "招待制アクセス",
    description: "Broker Desk は利用席が発行済みの不動産仲介チーム向けサービスです。社内管理者がアカウントを作成し、招待を送信します。",
    action: "ログインへ",
  };
}

export default async function SignUpPage() {
  const text = copy(await getLocale());
  return (
    <section className="broker-desk-auth-route flex min-h-screen items-center justify-center bg-[#f8f9ff] px-5 py-10 sm:px-8">
      <div className="w-full max-w-lg border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">{text.eyebrow}</p>
        <h1 className="mt-3 text-2xl font-black text-slate-950">{text.title}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">{text.description}</p>
        <Link
          href="/sign-in"
          className="mt-7 inline-flex min-h-11 items-center justify-center border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          {text.action}
        </Link>
      </div>
    </section>
  );
}
