"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClosedBetaTester,
  getClosedBetaAccessSummary,
  recoverClosedBetaInvitation,
  type ClosedBetaTesterResult,
} from "@/lib/closed-beta-access";
import { updateTenantAccountLifecycle } from "@/lib/data";
import { requirePlatformOwnerSession } from "@/lib/platform-session";
import { validateTenantServicePeriod } from "@/lib/tenant-service";
import { getLocale } from "@/lib/locale";

export type ClosedBetaActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  result?: ClosedBetaTesterResult;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function closedBetaMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "closed_beta_owner_email_in_use") {
    return "该邮箱已经存在。请先核对现有待确认 workspace，再决定是否从既有 membership 发行邀请；系统不会自动创建第二个 tenant。";
  }
  if (code === "closed_beta_invitation_delivery_uncertain") {
    return "账户已创建，但邀请结果或本地记录无法确认。请先核对身份服务状态，不要盲目重新发行。";
  }
  if (code === "closed_beta_invitation_delivery_in_progress") {
    return "邀请仍在发送或结果未知。请先核对身份服务状态，系统不会盲目重发。";
  }
  if (code === "closed_beta_invitation_provider_not_configured" || code === "closed_beta_app_origin_required") {
    return "邀请服务未配置。生产环境需要 Supabase Auth 与固定应用 origin；本地 demo 只显示合成标识。";
  }
  if (code === "closed_beta_invitation_delivery_failed") {
    return "账户已创建，但邀请服务拒绝了请求。请从现有 membership 处理后续发行。";
  }
  if (code === "closed_beta_invitation_reissue_not_allowed") {
    return "当前邀请结果不是已知失败或未发行状态；为避免重复链路，系统不会重新发行。";
  }
  if (code === "closed_beta_invitation_membership_missing") {
    return "指定的待确认 membership 不存在或不属于 closed-beta tester。";
  }
  if (code.includes("service end date") || code.includes("serviceStartAt") || code.includes("serviceEndAt")) {
    return "服务期日期无效。服务结束日按 Asia/Tokyo 日历日计算并包含当天。";
  }
  if (code === "closed_beta_tester_email_invalid") return "请输入有效的 tester 邮箱。";
  if (code === "closed_beta_tester_name_required") return "请输入 tester 姓名。";
  if (code === "closed_beta_platform_actor_required") return "需要平台管理员身份。";
  return "closed-beta 操作未完成，请检查输入与平台状态。";
}

export async function createClosedBetaTesterAction(
  _previousState: ClosedBetaActionState,
  formData: FormData,
): Promise<ClosedBetaActionState> {
  const session = await requirePlatformOwnerSession();
  try {
    const serviceEndAt = text(formData, "serviceEndAt");
    if (!serviceEndAt) throw new Error("serviceEndAt is required");
    const locale = await getLocale();
    const result = await createClosedBetaTester({
      actorUserId: session.user.id,
      testerName: text(formData, "testerName"),
      testerEmail: text(formData, "testerEmail"),
      serviceStartAt: text(formData, "serviceStartAt") || undefined,
      serviceEndAt,
      locale,
    });
    revalidatePath("/platform/closed-beta");
    return { status: "success", result };
  } catch (error) {
    return { status: "error", message: closedBetaMessage(error) };
  }
}

export async function recoverClosedBetaInvitationAction(
  _previousState: ClosedBetaActionState,
  formData: FormData,
): Promise<ClosedBetaActionState> {
  const session = await requirePlatformOwnerSession();
  try {
    const tenantId = text(formData, "tenantId");
    const membershipId = text(formData, "membershipId");
    if (!tenantId || !membershipId) throw new Error("closed_beta_invitation_membership_missing");
    const result = await recoverClosedBetaInvitation({
      actorUserId: session.user.id,
      tenantId,
      membershipId,
    });
    revalidatePath("/platform/closed-beta");
    return { status: "success", result };
  } catch (error) {
    return { status: "error", message: closedBetaMessage(error) };
  }
}

export async function updateClosedBetaAccessAction(formData: FormData) {
  const session = await requirePlatformOwnerSession();
  const tenantId = text(formData, "tenantId");
  const operation = text(formData, "operation");
  const serviceStartAt = text(formData, "serviceStartAt") || undefined;
  const serviceEndAt = text(formData, "serviceEndAt") || undefined;
  if (!tenantId) throw new Error("closed_beta_tenant_id_required");
  if (operation !== "extend" && operation !== "revoke") throw new Error("closed_beta_operation_invalid");
  const scoped = await getClosedBetaAccessSummary(session.user.id, tenantId);
  validateTenantServicePeriod({ serviceStartAt, serviceEndAt });
  const account = await updateTenantAccountLifecycle({
    tenantId: scoped.account.id,
    status: operation === "revoke" ? "suspended" : "active",
    serviceStartAt,
    serviceEndAt,
    actorUserId: session.user.id,
  });
  if (!account) throw new Error("closed_beta_tenant_not_found");
  revalidatePath("/platform/closed-beta");
  redirect("/platform/closed-beta");
}
