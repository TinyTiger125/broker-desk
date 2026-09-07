"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { deletePreimportPropertyUpload } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { requireTenantSession } from "@/lib/tenant-session";

export async function deletePreimportUploadAction(
  previous: { error: string; attempt: number }, formData: FormData,
): Promise<{ error: string; attempt: number }> {
  const locale = await getLocale();
  const refused = {
    ja: "ファイルを削除できません。権限・利用状況が変わった可能性があります。原本は削除していません。",
    zh: "无法删除文件。权限或使用状态可能已变化，原件未删除。",
    ko: "파일을 삭제할 수 없습니다. 권한이나 사용 상태가 변경되었을 수 있습니다. 원본은 삭제되지 않았습니다.",
  }[locale];
  let deleted = false;
  try {
    const session = await requireTenantSession({ permission: "source.read" });
    const member = session.membership;
    const allowed = member.status === "active" && (
      (member.role === "tenant_owner" && member.capability === "company_owner") ||
      (member.role === "manager" && member.capability === "company_form_admin")
    );
    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!allowed || !jobId || jobId.length > 128 || formData.get("confirm") !== "delete-original") {
      return { error: refused, attempt: previous.attempt + 1 };
    }
    // RPC independently derives the actor and rechecks role, scope, lifecycle and references under locks.
    deleted = await deletePreimportPropertyUpload({ tenantId: session.tenant.id, userId: session.user.id, jobId });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // Do not echo SQL, attachment identifiers or server diagnostics to the client.
    return { error: {
      ja: "削除結果を確認できません。再送せず、ページを再表示して状態を確認してください。",
      zh: "无法确认删除结果。请勿重复提交，刷新页面核对状态。",
      ko: "삭제 결과를 확인할 수 없습니다. 다시 제출하지 말고 페이지를 새로 열어 상태를 확인해 주세요.",
    }[locale], attempt: previous.attempt + 1 };
  }
  if (!deleted) return { error: refused, attempt: previous.attempt + 1 };
  revalidatePath("/import-center");
  revalidatePath("/");
  redirect("/import-center");
}
