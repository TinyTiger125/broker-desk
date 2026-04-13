import { NextResponse } from "next/server";
import { isClientStage } from "@/lib/domain";
import { addAuditLog, getClientById, getDefaultUser, setClientStageWithLog } from "@/lib/data";
import { isLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/locale";
import { StageTransitionBlockedError } from "@/lib/workflow-engine";

type PatchContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: PatchContext) {
  const localeRaw = request.headers.get("cookie") ?? "";
  const localeFromCookieRaw = localeRaw
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split("=")[1];
  const localeFromCookie = localeFromCookieRaw ? decodeURIComponent(localeFromCookieRaw) : undefined;
  const locale: Locale = localeFromCookie && isLocale(localeFromCookie) ? localeFromCookie : "ja";

  const textByLocale = {
    ja: {
      userNotFound: "担当ユーザーが見つかりません",
      clientNotFound: "顧客が見つかりません",
      forbidden: "この顧客に対する操作権限がありません",
      invalidStage: "ステージが不正です",
      blocked: "ステージ遷移条件を満たしていません",
      defaultReason: "進捗ボードでステージ更新",
      auditMessage: "進捗ボードでステージを更新しました",
    },
    zh: {
      userNotFound: "未找到负责人用户",
      clientNotFound: "未找到客户",
      forbidden: "无权限操作该客户",
      invalidStage: "阶段参数不合法",
      blocked: "未满足阶段迁移条件",
      defaultReason: "在进度看板更新阶段",
      auditMessage: "已在进度看板更新阶段",
    },
    ko: {
      userNotFound: "담당 사용자를 찾을 수 없습니다",
      clientNotFound: "고객을 찾을 수 없습니다",
      forbidden: "해당 고객에 대한 작업 권한이 없습니다",
      invalidStage: "단계 값이 올바르지 않습니다",
      blocked: "단계 전이 조건을 충족하지 못했습니다",
      defaultReason: "진행 보드에서 단계 업데이트",
      auditMessage: "진행 보드에서 단계를 업데이트했습니다",
    },
  } as const;
  const tx = textByLocale[locale];

  const { id } = await context.params;
  const user = await getDefaultUser();
  if (!user) {
    return NextResponse.json({ error: tx.userNotFound }, { status: 401 });
  }
  const client = await getClientById(id);
  if (!client) {
    return NextResponse.json({ error: tx.clientNotFound }, { status: 404 });
  }
  if (client.ownerUserId !== user.id) {
    return NextResponse.json({ error: tx.forbidden }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    stage?: string;
    reason?: string;
  };
  const stage = payload.stage ?? "";

  if (!isClientStage(stage)) {
    return NextResponse.json({ error: tx.invalidStage }, { status: 400 });
  }

  let updated;
  try {
    updated = await setClientStageWithLog({
      clientId: id,
      stage,
      createdById: user.id,
      reason: payload.reason ?? tx.defaultReason,
      locale,
    });
  } catch (error) {
    if (error instanceof StageTransitionBlockedError) {
      return NextResponse.json(
        {
          error: tx.blocked,
          blockers: error.blockers,
        },
        { status: 422 }
      );
    }
    throw error;
  }
  if (!updated) {
    return NextResponse.json({ error: tx.clientNotFound }, { status: 404 });
  }
  await addAuditLog({
    userId: user.id,
    action: "client_stage_updated",
    targetType: "client",
    targetId: id,
    message: `${tx.auditMessage}: ${stage}`,
  });

  return NextResponse.json({ ok: true, client: updated });
}
