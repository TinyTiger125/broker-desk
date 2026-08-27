import type { TenantCapabilityPreset, TenantInvitationStatus, TenantMembershipStatus } from "@/lib/data";
import type { Locale } from "@/lib/locale";

export const MEMBER_CAPABILITY_PRESETS = ["company_owner", "company_form_admin", "ordinary_member"] as const satisfies readonly TenantCapabilityPreset[];

export const MEMBER_CAPABILITY_LABELS: Record<TenantCapabilityPreset, Record<Locale, string>> = {
  company_owner: { ja: "会社の責任者", zh: "公司负责人", ko: "회사 책임자" },
  company_form_admin: { ja: "会社フォーム管理者", zh: "公司表格管理员", ko: "회사 양식 관리자" },
  ordinary_member: { ja: "一般メンバー", zh: "普通成员", ko: "일반 멤버" },
};

export const MEMBER_CAPABILITY_DESCRIPTIONS: Record<TenantCapabilityPreset, Record<Locale, string>> = {
  company_owner: {
    ja: "会社設定、メンバー、会社テンプレートを管理し、操作履歴を確認できます。案件・資料の閲覧・更新と出力は、それぞれの資料に実際に付与された権限に従います。この役割だけで他のメンバーの非公開資料にアクセスできるわけではありません。",
    zh: "可管理公司设置、成员和公司模板，并查看操作记录。每份案件和资料的查看、更新及输出，均以该资料实际授予的权限为准；该身份本身不会自动获得其他成员的私有资料访问权。",
    ko: "회사 설정, 멤버, 회사 템플릿을 관리하고 작업 기록을 확인할 수 있습니다. 각 안건과 자료의 열람·수정 및 출력은 해당 자료에 실제로 부여된 권한을 따릅니다. 이 역할만으로 다른 멤버의 비공개 자료에 자동으로 접근할 수는 없습니다.",
  },
  company_form_admin: {
    ja: "案件・資料に関する業務と出力、会社テンプレートの管理、操作履歴の確認を行えます。各案件・資料の閲覧・更新と出力は、それぞれの資料に実際に付与された権限に従います。この役割だけで他のメンバーの非公開資料にはアクセスできず、メンバー管理もできません。",
    zh: "可处理案件与资料相关工作及输出，并管理公司模板、查看操作记录。每份案件和资料的查看、更新及输出，均以该资料实际授予的权限为准；该身份本身不会自动获得其他成员的私有资料访问权，也不能管理成员。",
    ko: "안건·자료 관련 업무와 출력, 회사 템플릿 관리, 작업 기록 확인을 수행할 수 있습니다. 각 안건과 자료의 열람·수정 및 출력은 해당 자료에 실제로 부여된 권한을 따릅니다. 이 역할만으로 다른 멤버의 비공개 자료에 자동으로 접근할 수 없으며 멤버 관리도 할 수 없습니다.",
  },
  ordinary_member: {
    ja: "案件・資料の入力や更新、出力の作成を行えます。各案件・資料の閲覧・更新と出力は、それぞれの資料に実際に付与された権限に従います。メンバー管理や会社全体の管理はできません。",
    zh: "可录入和更新案件与资料，并制作输出。每份案件和资料的查看、更新及输出，均以该资料实际授予的权限为准；不能管理成员或执行公司级管理。",
    ko: "안건과 자료를 입력·수정하고 출력을 만들 수 있습니다. 각 안건과 자료의 열람·수정 및 출력은 해당 자료에 실제로 부여된 권한을 따릅니다. 멤버 관리나 회사 전체 관리는 할 수 없습니다.",
  },
};

export const MEMBERSHIP_STATUS_LABELS: Record<TenantMembershipStatus, Record<Locale, string>> = {
  active: { ja: "所属中", zh: "已加入", ko: "소속 중" },
  invited: { ja: "所属待ち", zh: "待加入", ko: "소속 대기" },
  suspended: { ja: "利用停止中", zh: "成员关系已暂停", ko: "이용 중지" },
  removed: { ja: "メンバー登録解除済み", zh: "成员关系已解除", ko: "멤버 등록 해제" },
};

export const INVITATION_STATUS_LABELS: Record<TenantInvitationStatus, Record<Locale, string>> = {
  not_sent: { ja: "未送信", zh: "未发送", ko: "미발송" },
  pending: { ja: "承諾待ち・処理中", zh: "待接受，处理中", ko: "수락 대기·처리 중" },
  accepted: { ja: "承諾済み", zh: "已接受", ko: "수락됨" },
  revoked: { ja: "取消済み", zh: "已撤销", ko: "취소됨" },
  expired: { ja: "期限切れ", zh: "已过期", ko: "만료됨" },
  failed: { ja: "送信失敗", zh: "发送失败", ko: "전송 실패" },
};

export function getMemberManagementCopy(locale: Locale) {
  return {
    title: locale === "zh" ? "公司成员与权限" : locale === "ko" ? "회사 멤버와 권한" : "会社メンバーと権限",
    subtitle:
      locale === "zh"
        ? "管理当前工作区的成员、邀请状态和可执行操作。"
        : locale === "ko"
          ? "현재 워크스페이스의 멤버, 초대 상태, 수행 가능한 작업을 관리합니다."
          : "現在のワークスペースのメンバー、招待状況、行える操作を管理します。",
    invite: locale === "zh" ? "添加成员" : locale === "ko" ? "멤버 추가" : "メンバー追加",
    inviteDescription:
      locale === "zh"
        ? "选择权限范围后发送邀请。对方明确接受前不会成为公司成员。"
        : locale === "ko"
          ? "권한 범위를 선택해 초대합니다. 상대가 명시적으로 수락하기 전에는 회사 멤버가 되지 않습니다."
          : "権限の範囲を選んで招待します。相手が明示的に承諾するまでは会社メンバーになりません。",
    permissionGuide: locale === "zh" ? "权限范围说明" : locale === "ko" ? "권한 범위 안내" : "権限範囲の説明",
    name: locale === "zh" ? "姓名" : locale === "ko" ? "이름" : "氏名",
    email: locale === "zh" ? "邮箱" : locale === "ko" ? "이메일" : "メール",
    role: locale === "zh" ? "权限范围" : locale === "ko" ? "권한 범위" : "権限範囲",
    status: locale === "zh" ? "状态" : locale === "ko" ? "상태" : "状態",
    membershipStatus: locale === "zh" ? "成员关系状态" : locale === "ko" ? "소속 상태" : "所属状態",
    invitationStatus: locale === "zh" ? "邀请状态" : locale === "ko" ? "초대 상태" : "招待状態",
    actions: locale === "zh" ? "操作" : locale === "ko" ? "작업" : "操作",
    saveRole: locale === "zh" ? "保存权限" : locale === "ko" ? "권한 저장" : "権限を保存",
    suspend: locale === "zh" ? "停用" : locale === "ko" ? "중지" : "停止",
    reactivate: locale === "zh" ? "恢复" : locale === "ko" ? "재활성화" : "再有効化",
    sendInvite: locale === "zh" ? "发送邀请" : locale === "ko" ? "초대 보내기" : "招待送信",
    revokeInvite: locale === "zh" ? "撤销邀请" : locale === "ko" ? "초대 취소" : "招待を取り消す",
    remove: locale === "zh" ? "移除成员" : locale === "ko" ? "멤버 제거" : "メンバーを削除",
    soleOwnerLocked:
      locale === "zh"
        ? "请先指定另一名公司负责人，才能修改自己的负责人权限。"
        : locale === "ko"
          ? "다른 회사 책임자를 먼저 지정해야 자신의 책임자 권한을 변경할 수 있습니다."
          : "先に別の会社責任者を指定してから、自分の責任者権限を変更してください。",
    confirmSelfDemotion:
      locale === "zh"
        ? "我确认已指定另一名公司负责人，并要降低自己的负责人权限"
        : locale === "ko"
          ? "다른 회사 책임자를 지정했으며 내 책임자 권한을 낮추는 것을 확인합니다"
          : "別の会社責任者を指定し、自分の責任者権限を下げることを確認します",
    bound: locale === "zh" ? "已绑定登录" : locale === "ko" ? "로그인 연동됨" : "ログイン連携済み",
    unbound: locale === "zh" ? "未绑定登录" : locale === "ko" ? "로그인 미연동" : "ログイン未連携",
    current: locale === "zh" ? "当前用户" : locale === "ko" ? "현재 사용자" : "現在のユーザー",
    noPermissionTitle: locale === "zh" ? "无法管理公司成员" : locale === "ko" ? "회사 멤버를 관리할 수 없습니다" : "会社メンバーを管理できません",
    noPermission:
      locale === "zh"
        ? "当前成员没有公司成员管理权限。请返回工作台，或联系公司负责人。"
        : locale === "ko"
          ? "현재 멤버에게는 회사 멤버 관리 권한이 없습니다. 워크스페이스로 돌아가거나 회사 책임자에게 문의하세요."
          : "現在のメンバーには会社メンバー管理権限がありません。ワークスペースに戻るか、会社の責任者にご確認ください。",
    backToWorkspace: locale === "zh" ? "返回工作台" : locale === "ko" ? "워크스페이스로 돌아가기" : "ワークスペースに戻る",
    localOnly:
      locale === "zh"
        ? "邀请发送后保持邀请中；受邀者使用匹配邮箱明确接受后，才会成为公司成员。"
        : locale === "ko"
          ? "초대 후에는 초대 중 상태로 유지됩니다. 초대받은 이메일로 명시적으로 수락해야 회사 멤버가 됩니다."
          : "招待後は招待中のまま保持され、招待先のメールアドレスで明示的に承諾してから会社メンバーになります。",
    memberList: locale === "zh" ? "成员列表" : locale === "ko" ? "멤버 목록" : "メンバー一覧",
    memberCount: (count: number) =>
      locale === "zh" ? `${count} 名成员` : locale === "ko" ? `멤버 ${count}명` : `${count}名のメンバー`,
    emptyTitle: locale === "zh" ? "当前没有成员" : locale === "ko" ? "현재 멤버가 없습니다" : "現在メンバーはいません",
    emptyDescription:
      locale === "zh"
        ? "可使用上方表单邀请第一名成员。"
        : locale === "ko"
          ? "위 양식에서 첫 멤버를 초대할 수 있습니다."
          : "上のフォームから最初のメンバーを招待できます。",
    memberLoadErrorTitle: locale === "zh" ? "暂时无法读取成员" : locale === "ko" ? "멤버를 읽을 수 없습니다" : "メンバーを読み取れません",
    memberLoadErrorDescription:
      locale === "zh"
        ? "当前公司的成员信息读取失败。请重试；权限和成员关系未被修改。"
        : locale === "ko"
          ? "현재 회사의 멤버 정보를 읽지 못했습니다. 다시 시도해 주세요. 권한과 멤버 관계는 변경되지 않았습니다."
          : "現在の会社のメンバー情報を読み取れませんでした。もう一度お試しください。権限とメンバー関係は変更されていません。",
    retry: locale === "zh" ? "重新读取" : locale === "ko" ? "다시 읽기" : "再読み込み",
  };
}

export function getMemberManagementFlash(locale: Locale, flash?: string) {
  const messages: Record<string, Record<Locale, string>> = {
    member_invited: {
      ja: "メンバーを招待しました。招待は受け入れられるまで有効化されません。",
      zh: "已发送成员邀请；对方接受前仍处于邀请中。",
      ko: "멤버 초대를 보냈습니다. 수락 전에는 초대 중 상태로 유지됩니다.",
    },
    member_invited_pending: {
      ja: "招待を作成しました。送信設定を確認してから受け取ったメールアドレスで承諾してください。",
      zh: "已创建邀请，当前处于邀请中；请确认发送设置并让对方使用受邀邮箱接受。",
      ko: "초대를 만들었습니다. 발송 설정을 확인한 뒤 초대받은 이메일로 수락해 주세요.",
    },
    member_invitation_failed: {
      ja: "メンバーは招待中のまま保存されましたが、招待メールの送信に失敗しました。",
      zh: "成员已保留在邀请中，但邀请邮件发送失败；请检查设置后重试。",
      ko: "멤버는 초대 중으로 보존되었지만 초대 이메일 발송에 실패했습니다. 설정을 확인하고 다시 시도해 주세요.",
    },
    invitation_sent: { ja: "招待を再送信しました。", zh: "已重新发送邀请。", ko: "초대를 다시 보냈습니다." },
    invitation_pending: { ja: "招待は送信待ちとして保持されています。", zh: "邀请已保留为待发送状态。", ko: "초대가 발송 대기 상태로 유지되었습니다." },
    invitation_failed: { ja: "招待の再送信に失敗しました。", zh: "重新发送邀请失败。", ko: "초대 재전송에 실패했습니다." },
    invitation_revoked: { ja: "招待を取り消しました。", zh: "已撤销邀请。", ko: "초대를 취소했습니다." },
    member_role_updated: { ja: "メンバーの権限を更新しました。", zh: "已更新成员权限。", ko: "멤버 권한을 업데이트했습니다." },
    member_suspended: { ja: "メンバーを停止しました。", zh: "已暂停成员。", ko: "멤버를 중지했습니다." },
    member_reactivated: { ja: "メンバーを復元しました。", zh: "已恢复成员。", ko: "멤버를 복원했습니다." },
    member_removed: { ja: "メンバーを削除しました。", zh: "已移除成员。", ko: "멤버를 제거했습니다." },
    last_owner_protected: {
      ja: "最後の有効な会社責任者は降格・停止できません。先に別の会社責任者を指定してください。",
      zh: "最后一名有效公司负责人不能降级或停用。请先指定另一名公司负责人。",
      ko: "마지막 유효 회사 책임자는 권한을 낮추거나 중지할 수 없습니다. 먼저 다른 회사 책임자를 지정하세요.",
    },
  };
  return flash ? messages[flash]?.[locale] : undefined;
}
