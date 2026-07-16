const defaultTemplateUrl =
  "http://localhost:3002/platform/templates/j_lease_individual_v1?caseId=case_fixture_friends_guarantee_pdf";

const templateUrl =
  process.argv[2] ?? process.env.BROKER_DESK_TEMPLATE_HEALTH_URL ?? defaultTemplateUrl;

function resolveBrokerPreviewUrl(authoringUrl) {
  const url = new URL(authoringUrl);
  const templateId = url.pathname.split("/").filter(Boolean).at(-1);
  const caseId = url.searchParams.get("caseId");

  assert(templateId, `Template id missing from authoring URL: ${authoringUrl}`);
  assert(caseId, `caseId missing from authoring URL: ${authoringUrl}`);

  return new URL(
    `/guarantee-applications/${templateId}/preview?caseId=${encodeURIComponent(caseId)}`,
    url,
  ).toString();
}

const brokerPreviewUrl =
  process.env.BROKER_DESK_BROKER_PREVIEW_HEALTH_URL ?? resolveBrokerPreviewUrl(templateUrl);

function resolveAssetUrl(pageUrl, assetUrl) {
  return new URL(assetUrl.replaceAll("&amp;", "&"), pageUrl).toString();
}

function extractScriptUrls(html, pageUrl) {
  const urls = new Set();
  const scriptPattern = /<script\b[^>]*\bsrc="([^"]+)"/gi;
  let match;
  while ((match = scriptPattern.exec(html))) {
    const src = match[1];
    if (src.includes("/_next/static/")) urls.add(resolveAssetUrl(pageUrl, src));
  }
  return [...urls];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return { response, text };
}

const [templatePage, brokerPreviewPage] = await Promise.all([
  fetchText(templateUrl),
  fetchText(brokerPreviewUrl),
]);

assert(
  templatePage.response.ok,
  `Template authoring page returned ${templatePage.response.status}: ${templateUrl}`,
);
assert(
  templatePage.text.includes("テンプレート編集"),
  "Template authoring page did not render the template editing surface",
);
assert(templatePage.text.includes("入力欄"), "Template authoring page did not render the add-field control");
assert(templatePage.text.includes("吸着"), "Template authoring page did not render the snap control");

assert(
  brokerPreviewPage.response.ok,
  `Broker preview page returned ${brokerPreviewPage.response.status}: ${brokerPreviewUrl}`,
);
assert(
  brokerPreviewPage.text.includes("申込書の確認"),
  "Broker preview page did not render the case-level preview surface",
);
assert(
  !brokerPreviewPage.text.includes("公式テンプレートを校正する"),
  "Broker preview page rendered the template authoring heading",
);

const scriptUrls = extractScriptUrls(templatePage.text, templateUrl);
assert(scriptUrls.length > 0, "Preview page did not include any Next.js client scripts");

const scriptResults = await Promise.all(
  scriptUrls.map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    return {
      url,
      status: response.status,
      ok: response.ok,
    };
  }),
);

const failedScripts = scriptResults.filter((result) => !result.ok);
assert(
  failedScripts.length === 0,
  `Next.js client script check failed:\n${failedScripts
    .map((result) => `- ${result.status} ${result.url}`)
    .join("\n")}`,
);

const hasAppRuntime = scriptResults.some((result) => /\/(main-app|app-pages-internals|app\/)/.test(result.url));
assert(hasAppRuntime, "No App Router client runtime script was found");

console.log(
  `[PASS] Template factory and broker preview boundaries healthy: ${scriptResults.length} Next.js client scripts reachable for ${templateUrl}`,
);
