import http from "node:http";

const portArg = process.argv.indexOf("--port");
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : 3010);
const nestedParents = new Map([
  ["/properties/new", "/properties"],
  ["/guarantee-applications/friends-guarantee/preview", "/platform/templates"],
  ["/guarantee-forms/example/edit", "/guarantee-forms"],
  ["/platform/accounts", "/platform/templates"],
  ["/settings/members", "/"],
  ["/workspace/create", "/workspace"],
]);
const topLevel = new Set(["/", "/clients", "/properties", "/parties", "/quotes", "/platform/templates", "/workspace"]);

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function render(pathname) {
  const parent = nestedParents.get(pathname);
  const showBack = Boolean(parent) || (!topLevel.has(pathname) && pathname.split("/").filter(Boolean).length > 1);
  const href = parent ?? "/";
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local navigation fixture</title><style>
    :root{font:16px system-ui,sans-serif;color:#172033;background:#f8fafc}body{margin:0}header{display:flex;justify-content:flex-end;gap:8px;padding:16px;background:#172033}button{min-height:44px;border:1px solid #94a3b8;border-radius:8px;background:#fff;padding:8px 12px}main{max-width:720px;margin:0 auto;padding:24px}.bd-back-to-parent{margin-bottom:16px}.bd-back-to-parent-link{display:inline-flex;min-height:44px;align-items:center;gap:6px;border:1px solid #64748b;border-radius:8px;padding:8px 12px;color:#172033;background:#fff}.menu{position:relative}.panel{position:absolute;right:0;top:48px;z-index:2;width:220px;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;box-shadow:0 12px 24px #0f17201f}.panel[hidden]{display:none}
  </style></head><body><header><div class="menu" data-menu><button type="button" data-trigger aria-expanded="false">设置</button><div class="panel" data-panel hidden><button type="button">设置项</button></div></div><div class="menu" data-menu><button type="button" data-trigger aria-expanded="false">账号</button><div class="panel" data-panel hidden><button type="button">账号项</button></div></div></header><main>${showBack ? `<nav class="bd-back-to-parent" aria-label="返回上一级"><a class="bd-back-to-parent-link" href="${escapeHtml(href)}">← 返回上一级</a></nav>` : ""}<h1>Local fixture: ${escapeHtml(pathname)}</h1><p data-result>fixture only; no app or data service loaded.</p></main><script>
    for (const menu of document.querySelectorAll('[data-menu]')) { const trigger=menu.querySelector('[data-trigger]'), panel=menu.querySelector('[data-panel]'); let timer; const close=()=>{clearTimeout(timer);panel.hidden=true;trigger.setAttribute('aria-expanded','false')}; const open=()=>{clearTimeout(timer);panel.hidden=false;trigger.setAttribute('aria-expanded','true')}; const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!menu.matches(':hover')&&!panel.contains(document.activeElement))close()},200)}; trigger.addEventListener('click',()=>panel.hidden?open():close()); menu.addEventListener('pointerenter',open); menu.addEventListener('pointerleave',schedule); menu.addEventListener('focusin',event=>{if(event.target!==trigger)open()}); menu.addEventListener('focusout',event=>{if(!menu.contains(event.relatedTarget))schedule()}); document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close()}); document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.contains(document.activeElement)){close();trigger.focus()}}); }
  </script></body></html>`;
}

const server = http.createServer((request, response) => {
  if (request.url === "/__fixture_health") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("local-navigation-fixture");
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(render(pathname));
});

server.listen(port, "127.0.0.1", () => console.log(`Local navigation fixture listening on http://127.0.0.1:${port}`));
process.on("SIGINT", () => server.close(() => process.exit(0)));
