const defaultUrl =
  "http://localhost:3002/guarantee-applications/j_lease_individual_v1/preview?caseId=case_fixture_friends_guarantee_pdf";

const targetUrl = process.argv[2] ?? process.env.BROKER_DESK_TEMPLATE_HEALTH_URL ?? defaultUrl;

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

const page = await fetchText(targetUrl);

assert(page.response.ok, `Preview page returned ${page.response.status}: ${targetUrl}`);
assert(
  page.text.includes("可編集プレビュー") || page.text.includes("テンプレート編集"),
  "Preview page did not render the calibration surface",
);
assert(page.text.includes("入力欄を追加"), "Preview page did not render the add-field toolbar control");
assert(page.text.includes("吸着"), "Preview page did not render the snap toolbar control");

const scriptUrls = extractScriptUrls(page.text, targetUrl);
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
  `[PASS] Template runtime assets healthy: ${scriptResults.length} Next.js client scripts reachable for ${targetUrl}`,
);
