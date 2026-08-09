import { SignIn } from "@clerk/nextjs";
import { isClerkAuthEnabled } from "@/lib/auth-mode";
import { getLocale, type Locale } from "@/lib/locale";

function copy(locale: Locale) {
  if (locale === "zh") {
    return {
      eyebrow: "Broker Desk",
      title: "登录工作区",
      description: "使用受邀请的邮箱登录，进入所属公司的资料管理工作区。",
      invitationTitle: "账号由管理员开通",
      invitationDescription: "Broker Desk 采用邀请制。请联系贵公司的管理员或平台管理员开通席位。",
      setupTitle: "登录服务尚未配置",
      setupDescription: "此环境未配置账号登录服务。为保护工作区数据，暂不能直接进入业务页面。",
    };
  }
  if (locale === "ko") {
    return {
      eyebrow: "Broker Desk",
      title: "워크스페이스 로그인",
      description: "초대받은 이메일 주소로 로그인하여 소속 회사의 업무 공간에 접속합니다.",
      invitationTitle: "계정은 관리자가 개설합니다",
      invitationDescription: "Broker Desk는 초대제로 운영됩니다. 회사 관리자 또는 플랫폼 관리자에게 좌석 개설을 요청하세요.",
      setupTitle: "로그인 서비스가 설정되지 않았습니다",
      setupDescription: "이 환경에는 계정 로그인 서비스가 설정되어 있지 않습니다. 워크스페이스 데이터를 보호하기 위해 업무 화면으로 바로 들어갈 수 없습니다.",
    };
  }
  return {
    eyebrow: "Broker Desk",
    title: "ワークスペースにログイン",
    description: "招待されたメールアドレスでログインし、所属する会社の業務スペースを開きます。",
    invitationTitle: "アカウントは管理者が発行します",
    invitationDescription: "Broker Desk は招待制です。ご利用の際は、社内管理者またはプラットフォーム管理者に席の発行をご依頼ください。",
    setupTitle: "ログインサービスが未設定です",
    setupDescription: "この環境にはアカウントログインサービスが設定されていません。ワークスペースのデータを保護するため、業務画面には直接入れません。",
  };
}

export default async function SignInPage() {
  const locale = await getLocale();
  const text = copy(locale);

  if (!isClerkAuthEnabled()) {
    return (
      <section className="broker-desk-auth-route min-h-screen bg-[#f8f9ff] px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl content-center gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(22rem,0.7fr)] lg:gap-20">
          <div className="self-center">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">{text.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">{text.title}</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-600">{text.description}</p>
          </div>
          <div className="border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-base font-black text-slate-950">{text.setupTitle}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{text.setupDescription}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="broker-desk-auth-route min-h-screen bg-[#f8f9ff] px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl content-center gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(22rem,0.7fr)] lg:gap-20">
        <div className="self-center">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#1960a3]">{text.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">{text.title}</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-600">{text.description}</p>
          <div className="mt-8 border-l-2 border-[#1960a3] pl-4">
            <p className="text-sm font-bold text-slate-900">{text.invitationTitle}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{text.invitationDescription}</p>
          </div>
        </div>
        <div className="flex items-center justify-center lg:justify-end">
          <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/workspace" />
        </div>
      </div>
    </section>
  );
}
