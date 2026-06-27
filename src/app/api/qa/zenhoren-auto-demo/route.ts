import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  activeDataDriver,
  addAuditLog,
  getBrokerageCaseById,
  updateBrokerageCaseConfirmedData,
} from "@/lib/data";
import {
  FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY,
  FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY,
  FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY,
  FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY,
  GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY,
  sanitizeGuaranteeConfirmedOverlayFields,
} from "@/lib/friends-guarantee-pdf";
import { isQaApiRequestAllowed, rejectQaApiRequest } from "@/lib/qa-api";
import { TenantSessionError, requireTenantSession } from "@/lib/tenant-session";

export const dynamic = "force-dynamic";

const ZENHOREN_TEMPLATE_ID = "zenhoren_individual_v1";
const DEFAULT_CASE_ID = "case_fixture_friends_guarantee_pdf";

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function yen(min: number, max: number, step = 1000): string {
  const count = Math.floor((max - min) / step);
  return String(min + Math.floor(Math.random() * Math.max(1, count + 1)) * step);
}

function phone(prefix: string): string {
  const middle = String(1000 + Math.floor(Math.random() * 9000));
  const last = String(1000 + Math.floor(Math.random() * 9000));
  return `${prefix}-${middle}-${last}`;
}

function buildRandomZenhorenDemoData(): Record<string, string> {
  const roomNumber = pick(["203", "506", "802", "1001", "1203A"]);
  const rent = yen(82000, 185000);
  const commonFee = yen(3000, 16000);
  const parkingFee = pick(["0", yen(12000, 35000)]);
  const deposit = String(Number(rent) * pick([1, 2]));
  const keyMoney = String(Number(rent) * pick([0, 1]));
  const monthlyRentTotal = String(Number(rent) + Number(commonFee) + Number(parkingFee));

  return {
    "property.name": pick([
      "晴海ベイサイドレジデンス東棟プレミアムフロア",
      "麻布十番グリーンヒルズレジデンス",
      "中目黒サクラテラス",
    ]),
    "property.roomNumber": roomNumber,
    "property.postalCode": pick(["1060032", "1500002", "1040053"]),
    "property.usage": "住居用",
    "property.address": pick([
      "東京都中央区晴海三丁目8番1号 晴海ベイサイドレジデンス東棟",
      "東京都港区麻布十番二丁目4番7号",
      "東京都目黒区上目黒一丁目12番5号",
    ]),
    "lease.moveInDate": pick(["2026年7月1日", "2026年8月15日", "2026年9月1日"]),
    "lease.rent": rent,
    "lease.commonFee": commonFee,
    "lease.deposit": deposit,
    "lease.keyMoney": keyMoney,
    "lease.parkingFee": parkingFee,
    "lease.monthlyRentTotal": monthlyRentTotal,
    "applicant.name": pick(["佐藤 健一", "鈴木 美咲", "田中 一郎"]),
    "applicant.furigana": pick(["サトウ ケンイチ", "スズキ ミサキ", "タナカ イチロウ"]),
    "applicant.birthDate": pick(["1988年4月12日", "1992年11月3日", "1979年6月25日"]),
    "applicant.phone": phone("090"),
    "applicant.currentPostalCode": pick(["1410032", "1540024", "1710022"]),
    "applicant.currentAddress": pick([
      "東京都品川区大崎四丁目5番6号 サンプルマンション301",
      "東京都世田谷区三軒茶屋二丁目3番4号",
      "東京都豊島区南池袋一丁目8番9号",
    ]),
    "applicant.employerName": pick([
      "東京サンプルテクノロジー株式会社",
      "日本橋メディアソリューション合同会社",
      "株式会社青山デザイン研究所",
    ]),
    "applicant.employerPhone": phone("03"),
    "applicant.employerPostalCode": pick(["1000005", "1500002", "1600023"]),
    "applicant.employerAddress": pick([
      "東京都千代田区丸の内一丁目1番1号",
      "東京都渋谷区渋谷二丁目10番15号",
      "東京都新宿区西新宿三丁目2番9号",
    ]),
    "applicant.annualIncome": pick(["420", "560", "680", "820"]),
    "applicant.yearsEmployed": pick(["2年", "4年", "7年", "12年"]),
    "emergencyContact.name": pick(["佐藤 直子", "鈴木 健太", "田中 花子"]),
    "emergencyContact.birthDate": pick(["1960年4月4日", "1965年5月5日", "1970年10月10日"]),
    "emergencyContact.phone": phone("080"),
    "emergencyContact.postalCode": pick(["1060032", "1350061", "1700013"]),
    "broker.companyName": pick([
      "東京サクラリアルティ株式会社",
      "Cherry Investment株式会社",
      "港区グランド不動産株式会社",
    ]),
    "broker.phone": phone("03"),
    "broker.fax": phone("03"),
    "broker.staffName": pick(["田中", "佐藤", "山本"]),
  };
}

export async function POST(request: Request) {
  if (!isQaApiRequestAllowed(request)) return rejectQaApiRequest();

  if (activeDataDriver !== "memory") {
    return NextResponse.json(
      { ok: false, error: "qa_demo_only_supports_memory_driver" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { caseId?: string };
  let session;
  try {
    session = await requireTenantSession({ permission: "output.update_draft" });
  } catch (error) {
    if (error instanceof TenantSessionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    throw error;
  }
  const user = session.user;
  const tenantId = session.tenant.id;

  const caseId = String(body.caseId ?? DEFAULT_CASE_ID).trim() || DEFAULT_CASE_ID;
  const brokerageCase = await getBrokerageCaseById({ userId: user.id, tenantId, caseId });
  if (!brokerageCase) return NextResponse.json({ ok: false, error: "case_not_found" }, { status: 404 });

  const nextConfirmedData: Record<string, unknown> = {
    ...brokerageCase.confirmedDataJson,
    ...buildRandomZenhorenDemoData(),
  };

  const confirmedOverlayFieldsByTemplate = sanitizeGuaranteeConfirmedOverlayFields(
    nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY],
  );
  delete confirmedOverlayFieldsByTemplate[ZENHOREN_TEMPLATE_ID];
  if (Object.keys(confirmedOverlayFieldsByTemplate).length > 0) {
    nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY] = confirmedOverlayFieldsByTemplate;
  } else {
    delete nextConfirmedData[GUARANTEE_CONFIRMED_OVERLAY_FIELDS_KEY];
  }
  delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDES_KEY];
  delete nextConfirmedData[FRIENDS_GUARANTEE_DELETED_OVERLAY_FIELDS_KEY];
  delete nextConfirmedData[FRIENDS_GUARANTEE_LAYOUT_OVERRIDE_VERSIONS_KEY];
  delete nextConfirmedData[FRIENDS_GUARANTEE_CUSTOM_FIELDS_KEY];

  const updatedCase = await updateBrokerageCaseConfirmedData({
    userId: user.id,
    tenantId,
    caseId,
    confirmedDataJson: nextConfirmedData,
  });
  if (!updatedCase) return NextResponse.json({ ok: false, error: "case_update_failed" }, { status: 500 });

  await addAuditLog({
    tenantId,
    userId: user.id,
    action: "qa_zenhoren_auto_demo_generated",
    targetType: "import_job",
    targetId: caseId,
    message: `全保連の安全自動入力デモデータを準備しました: ${updatedCase.caseTitle}`,
    context: {
      caseId,
      templateId: ZENHOREN_TEMPLATE_ID,
      policy: "certified_auto_fields_only",
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/output-center");
  revalidatePath(`/guarantee-applications/${ZENHOREN_TEMPLATE_ID}/preview`);

  return NextResponse.json({
    ok: true,
    caseId,
    templateId: ZENHOREN_TEMPLATE_ID,
    editUrl: `/guarantee-applications/${ZENHOREN_TEMPLATE_ID}/preview?caseId=${encodeURIComponent(caseId)}`,
    pdfPreviewUrl:
      `/api/guarantee-applications/${ZENHOREN_TEMPLATE_ID}/download?caseId=${encodeURIComponent(caseId)}&mode=preview`,
    policy: "certified stable fields are printed when they fit; volatile fields stay out of the PDF until preview confirmation",
  });
}
