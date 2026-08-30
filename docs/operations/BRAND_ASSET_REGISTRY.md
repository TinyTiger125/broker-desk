# Broker Desk 品牌资产登记与切换门

> 状态：Current / Production brand name not final
> 当前临时产品名：`Broker Desk`
> 适用范围：产品界面、认证、邮件、域名、官方模板与客户可见支持渠道。

本文记录客户能够看到或依赖的品牌身份。正式品牌名称、域名或视觉资产发生变化时，必须按同一次发布候选统一修改和验证，不能只修改产品页面。

## 当前登记

| 资产 | 当前值 | 状态 | 权威位置 |
|---|---|---|---|
| 产品显示名 | `Broker Desk` | 临时有效 | 产品 Shell、locale 文案 |
| Clerk Application name | `Broker Desk` | Development 已配置 | Clerk Application settings |
| 邀请邮件主题与正文品牌 | `Broker Desk` | Development 已配置 | `config/clerk/invitation-email.json`、`config/clerk/invitation-email.ja.html` |
| 邀请邮件发件地址本地部分 | `invitations` | Development 已配置 | `config/clerk/invitation-email.json` |
| Logo / Favicon | 未正式确定 | 待定 | Clerk Branding、Web App assets |
| 客户支持邮箱 | 未正式确定 | 待定 | Clerk Application settings、产品帮助入口、邮件页脚 |
| Production 主域名 | 未正式确定 | 待定 | DNS、Clerk Production domain、Vercel/custom hosting、邮件链接 |
| Staging 固定域名 | 非品牌资产 | 环境专用 | Staging deployment configuration |

## 必须同时切换的表面

正式品牌定名或域名切换时，同一发布候选至少覆盖：

1. 产品 Shell、登录页、404/错误页及 ja/zh/ko 用户可见名称；
2. Clerk Application name、Logo、Favicon、Support email；
3. 邀请、验证、登录、密码与安全通知邮件的主题、正文、发件人显示、页脚和链接；
4. Clerk Production domain、登录/注册/邀请回跳地址与允许来源；
5. Production DNS、TLS、部署域名、健康检查及回退地址；
6. 官方 PDF 模板、下载文件名、元数据及客户可见页眉/页脚；
7. 隐私政策、服务条款、支持渠道和运营通知。

## 发布门

品牌或域名切换只有在以下证据全部取得后才算完成：

- 从真实外部邮箱收到至少一封邀请邮件，发件人、主题、正文、页脚均显示新品牌；
- 邀请按钮和备用链接进入新 Production 域名，接受后回到正确工作区；
- 登录、退出、验证、忘记密码及安全通知不再出现旧品牌；
- 桌面与窄屏产品 Shell、错误页和官方模板不再出现旧品牌；
- DNS/TLS、认证回调和健康检查通过，并保留可执行回退方案；
- 仓库搜索和 Clerk/Vercel/DNS 配置核对未发现仍会向客户展示的旧名称或旧域名。

## 边界

- 公网 **IP 地址不是品牌资产**，不应写进客户邮件或产品链接。客户可见身份使用稳定域名；IP 只作为可替换的基础设施记录管理。
- Development/Staging 的 `[Development]` 标记和测试域名必须保留，避免把测试邮件误认为正式商业邮件。
- 本文不授权 Production 域名、DNS、Clerk Production 实例或真实客户邮件变更；这些动作仍需上线时单独授权。
