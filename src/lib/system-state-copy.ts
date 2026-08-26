export type SystemStateLocale = "ja" | "zh" | "ko";

const SYSTEM_STATE_LOCALES = ["ja", "zh", "ko"] as const;
const SYSTEM_STATE_LOCALE_COOKIE_NAME = "brokerdesk_locale";

function isSystemStateLocale(value: string): value is SystemStateLocale {
  return (SYSTEM_STATE_LOCALES as readonly string[]).includes(value);
}

export type SystemStateCopy = {
  notFoundTitle: string;
  notFoundDescription: string;
  routeErrorTitle: string;
  routeErrorDescription: string;
  globalErrorTitle: string;
  globalErrorDescription: string;
  loading: string;
  requestId: string;
  retry: string;
  back: string;
};

export type SystemStateErrorView = {
  title: string;
  description: string;
  requestIdLabel: string;
  requestId?: string;
  retry: string;
  back: string;
};

export const SYSTEM_STATE_COPY: Record<SystemStateLocale, SystemStateCopy> = {
  ja: {
    notFoundTitle: "ページが見つかりません",
    notFoundDescription: "ページが移動したか、アクセス権がない可能性があります。資料は削除されていません。",
    routeErrorTitle: "このページを一時的に開けません",
    routeErrorDescription: "資料は削除されていません。まず再試行してください。問題が続く場合は、ワークスペースに戻ってからもう一度開いてください。",
    globalErrorTitle: "サービスを一時的に利用できません",
    globalErrorDescription: "しばらくしてから再試行してください。問題が続く場合は、ワークスペースに戻ってからもう一度開いてください。",
    loading: "読み込んでいます",
    requestId: "リクエスト番号",
    retry: "再試行",
    back: "ワークスペースに戻る",
  },
  zh: {
    notFoundTitle: "页面未找到",
    notFoundDescription: "该页面可能已移动，或你当前没有访问权限。资料没有被删除。",
    routeErrorTitle: "此页面暂时无法打开",
    routeErrorDescription: "资料没有被删除。请先重试；若问题持续，请返回工作台后重新进入。",
    globalErrorTitle: "服务暂时不可用",
    globalErrorDescription: "请稍后重试。若问题持续，请返回工作台后重新进入。",
    loading: "正在加载",
    requestId: "请求编号",
    retry: "重试",
    back: "返回工作台",
  },
  ko: {
    notFoundTitle: "페이지를 찾을 수 없습니다",
    notFoundDescription: "페이지가 이동했거나 접근 권한이 없을 수 있습니다. 자료는 삭제되지 않았습니다.",
    routeErrorTitle: "이 페이지를 일시적으로 열 수 없습니다",
    routeErrorDescription: "자료는 삭제되지 않았습니다. 먼저 다시 시도해 주세요. 문제가 계속되면 워크스페이스로 돌아간 뒤 다시 열어 주세요.",
    globalErrorTitle: "서비스를 일시적으로 이용할 수 없습니다",
    globalErrorDescription: "잠시 후 다시 시도해 주세요. 문제가 계속되면 워크스페이스로 돌아간 뒤 다시 열어 주세요.",
    loading: "불러오는 중입니다",
    requestId: "요청 번호",
    retry: "다시 시도",
    back: "워크스페이스로 돌아가기",
  },
};

export function getSystemStateCopy(locale: SystemStateLocale) {
  return SYSTEM_STATE_COPY[locale];
}

function normalizeSystemStateLocale(value: string): SystemStateLocale | null {
  const normalized = value.trim().toLowerCase().split("-")[0] ?? "";
  return isSystemStateLocale(normalized) ? normalized : null;
}

function readSystemStateLocaleCookie(cookieHeader: string): SystemStateLocale | null {
  const encodedValue = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SYSTEM_STATE_LOCALE_COOKIE_NAME}=`))
    ?.slice(SYSTEM_STATE_LOCALE_COOKIE_NAME.length + 1);
  if (!encodedValue) return null;

  try {
    return normalizeSystemStateLocale(decodeURIComponent(encodedValue));
  } catch {
    return null;
  }
}

export function resolveSystemStateLocale({ cookie, documentLang }: { cookie: string; documentLang: string }): SystemStateLocale {
  return readSystemStateLocaleCookie(cookie) ?? normalizeSystemStateLocale(documentLang) ?? "ja";
}

export function getBrowserSystemStateLocale(): SystemStateLocale {
  if (typeof document === "undefined") return "ja";
  return resolveSystemStateLocale({ cookie: document.cookie, documentLang: document.documentElement.lang });
}

export const subscribeToSystemStateLocale = () => () => undefined;
export const getDefaultSystemStateLocale = (): SystemStateLocale => "ja";

function safeSystemStateRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const requestId = value.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? requestId : undefined;
}

export function getSystemStateErrorView(
  locale: SystemStateLocale,
  kind: "route" | "global",
  error: { digest?: unknown },
): SystemStateErrorView {
  const text = getSystemStateCopy(locale);
  return {
    title: kind === "route" ? text.routeErrorTitle : text.globalErrorTitle,
    description: kind === "route" ? text.routeErrorDescription : text.globalErrorDescription,
    requestIdLabel: text.requestId,
    requestId: safeSystemStateRequestId(error.digest),
    retry: text.retry,
    back: text.back,
  };
}
