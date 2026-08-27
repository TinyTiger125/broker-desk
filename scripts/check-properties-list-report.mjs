import { readFile } from "node:fs/promises";
import ts from "typescript";

const page = await readFile("src/app/properties/page.tsx", "utf8");
const loading = await readFile("src/app/properties/loading.tsx", "utf8");
const flashBanner = await readFile("src/components/page-flash-banner.tsx", "utf8");
const hub = await readFile("src/lib/hub.ts", "utf8");
const memory = await readFile("src/lib/data.memory.ts", "utf8");
const postgres = await readFile("src/lib/data.postgres.ts", "utf8");
const failures = [];

const sourceFile = ts.createSourceFile("src/app/properties/page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pageFunction = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
const unwrap = (node) => {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) current = current.expression;
  return current;
};
const terminates = (statement) => {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.length > 0 && terminates(statement.statements.at(-1));
  if (ts.isIfStatement(statement)) {
    const condition = unwrap(statement.expression)?.kind;
    if (condition === ts.SyntaxKind.TrueKeyword) return terminates(statement.thenStatement);
    if (condition === ts.SyntaxKind.FalseKeyword) return Boolean(statement.elseStatement && terminates(statement.elseStatement));
    return Boolean(statement.elseStatement && terminates(statement.thenStatement) && terminates(statement.elseStatement));
  }
  return false;
};
const liveJsx = (root, out = []) => {
  const visit = (node) => {
    if (node !== root && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && unwrap(node.left).kind === ts.SyntaxKind.FalseKeyword) return;
    if (ts.isConditionalExpression(node)) {
      const condition = unwrap(node.condition).kind;
      if (condition === ts.SyntaxKind.TrueKeyword) return visit(node.whenTrue);
      if (condition === ts.SyntaxKind.FalseKeyword) return visit(node.whenFalse);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) out.push(node);
    node.forEachChild(visit);
  };
  visit(root);
  return out;
};
const attr = (opening, name) => opening.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === name);
const isDescendant = (node, ancestor) => {
  for (let current = node.parent; current; current = current.parent) if (current === ancestor) return true;
  return false;
};
const visitLive = (root, visitor) => {
  const visit = (node) => {
    if (node !== root && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && unwrap(node.left).kind === ts.SyntaxKind.FalseKeyword) return;
    if (ts.isConditionalExpression(node)) {
      const condition = unwrap(node.condition).kind;
      if (condition === ts.SyntaxKind.TrueKeyword) return visit(node.whenTrue);
      if (condition === ts.SyntaxKind.FalseKeyword) return visit(node.whenFalse);
    }
    if (ts.isIfStatement(node)) {
      const condition = unwrap(node.expression).kind;
      if (condition === ts.SyntaxKind.TrueKeyword) return visit(node.thenStatement);
      if (condition === ts.SyntaxKind.FalseKeyword) return node.elseStatement ? visit(node.elseStatement) : undefined;
    }
    visitor(node);
    node.forEachChild(visit);
  };
  visit(root);
};
const evaluateExpression = (node, environment) => {
  const current = unwrap(node);
  if (ts.isIdentifier(current)) return environment[current.text];
  if (ts.isStringLiteral(current)) return current.text;
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPropertyAccessExpression(current) && current.name.text === "length") {
    const value = evaluateExpression(current.expression, environment);
    return value?.length;
  }
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) return !evaluateExpression(current.operand, environment);
  if (ts.isBinaryExpression(current)) {
    const left = evaluateExpression(current.left, environment);
    const right = evaluateExpression(current.right, environment);
    switch (current.operatorToken.kind) {
      case ts.SyntaxKind.AmpersandAmpersandToken: return Boolean(left && right);
      case ts.SyntaxKind.BarBarToken: return Boolean(left || right);
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return left === right;
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return left !== right;
      case ts.SyntaxKind.GreaterThanToken: return Number(left) > Number(right);
      default: throw new Error(`unsupported predicate operator ${current.operatorToken.getText()}`);
    }
  }
  throw new Error(`unsupported predicate expression ${current.getText()}`);
};

if (!pageFunction?.body) {
  failures.push("PropertiesPage must remain the live top-level page function");
} else {
  const finalReturn = pageFunction.body.statements.at(-1);
  if (!finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression) {
    failures.push("PropertiesPage must end in the live List Report return");
  } else if (pageFunction.body.statements.slice(0, -1).some(terminates)) {
    failures.push("PropertiesPage List Report return must not follow a static terminator");
  } else {
    const openings = liveJsx(finalReturn.expression);
    const byTag = (tag) => openings.filter((node) => node.tagName.getText(sourceFile) === tag);
    const frames = byTag("PageFrame");
    const headers = byTag("PageHeader");
    const returnStates = byTag("ListReturnState");
    const shells = byTag("ListReportShell");
    if (frames.length !== 1 || headers.length !== 1 || returnStates.length !== 1 || shells.length !== 1) failures.push("live page must render one PageFrame, PageHeader, ListReturnState and ListReportShell");
    const shell = shells[0];
    if (shell && returnStates[0] && (!isDescendant(shell, returnStates[0].parent) || !isDescendant(returnStates[0], frames[0].parent))) failures.push("ListReportShell must stay inside the shared return-state wrapper and PageFrame");
    if (headers[0] && frames[0] && !isDescendant(headers[0], frames[0].parent)) failures.push("PageHeader must be a live PageFrame child");
    if (returnStates[0] && (attr(returnStates[0], "scope")?.initializer?.getText(sourceFile) !== '"properties"' || attr(returnStates[0], "listUrl")?.getText(sourceFile) !== "listUrl={returnTo}")) failures.push("shared return state must retain properties scope and returnTo");
    for (const name of ["scope", "filters", "summary", "results", "pagination", "state"]) {
      if (!shell || !attr(shell, name)) failures.push(`live ListReportShell must wire ${name}`);
    }
    const fallbacks = openings.filter((node) => attr(node, "data-list-return-fallback"));
    if (fallbacks.length !== 1 || !attr(fallbacks[0], "tabIndex") || !attr(fallbacks[0], "aria-labelledby") || !shell || !isDescendant(shell, fallbacks[0].parent)) failures.push("shared return wrapper must expose one accessible live fallback landmark around the shell");
    if (shell && !shell.getText(sourceFile).includes("visibleProperties.map")) failures.push("live results slot must render the existing paginated property rows");
    if (shell && !shell.getText(sourceFile).includes("readError") || shell && !shell.getText(sourceFile).includes("sorted.length === 0")) failures.push("live state slot must distinguish read error and empty results");
    const surfaces = byTag("StateSurface").filter((node) => shell && isDescendant(node, shell.parent));
    if (surfaces.length !== 2) failures.push("live state slot must use StateSurface for error and empty states");
  }
}

function paginationIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-pagination.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
  const finalReturn = fn?.body?.statements.at(-1);
  if (!finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression) return ["pagination must be in the live final page return"];
  const openings = [];
  visitLive(finalReturn.expression, (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
  });
  const shell = openings.filter((node) => node.tagName.getText(sf) === "ListReportShell");
  if (shell.length !== 1) return ["pagination must belong to the unique live ListReportShell"];
  const pagination = shell[0].attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "pagination");
  const paginationText = pagination?.initializer?.getText(sf) ?? "";
  if (!paginationText.includes("pageCount > 1 && !readError")) issues.push("pagination must remain gated by pageCount and readError");
  if (paginationText.includes("false &&")) issues.push("pagination must not be hidden behind a constant-false branch");
  const links = openings.filter((node) => node.tagName.getText(sf) === "Link" && pagination && isDescendant(node, pagination));
  const expected = [
    "href={buildPropertiesHref({ ...filters, page: safePage - 1 })}",
    "href={buildPropertiesHref({ ...filters, page: safePage + 1 })}",
  ];
  if (links.length !== 2) issues.push("pagination must expose exactly two live directional links");
  links.forEach((link, index) => {
    const href = link.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "href")?.getText(sf);
    const className = link.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "className")?.initializer?.getText(sf) ?? "";
    if (href !== expected[index]) issues.push(`pagination link ${index + 1} must preserve its exact page href`);
    for (const token of ["inline-flex", "min-h-11", "items-center", "focus-visible:outline", "focus-visible:outline-[length:var(--bd-focus-ring-width)]", "focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"]) {
      if (!className.includes(token)) issues.push(`pagination link ${index + 1} must retain ${token}`);
    }
  });
  return issues;
}

failures.push(...paginationIssues(page));
for (const [label, mutation] of [
  ["missing touch height", (source) => source.replace("inline-flex min-h-11 items-center rounded-md", "inline-flex items-center rounded-md")],
  ["wrong live caller", (source) => source.replace("pagination={pageCount > 1 && !readError ? (", "pagination={false && pageCount > 1 && !readError ? (")],
  ["constant-false ternary", (source) => source.replace("pagination={pageCount > 1 && !readError ? (", "pagination={false ? (")],
  ["wrong previous href", (source) => source.replace("href={buildPropertiesHref({ ...filters, page: safePage - 1 })}", "href={returnTo}")],
]) {
  const mutated = mutation(page);
  if (mutated === page) failures.push(`pagination synthetic ${label} did not hit its target`);
  else if (paginationIssues(mutated).length === 0) failures.push(`pagination synthetic ${label} must fail`);
}

function filterControlIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-filters.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
  const finalReturn = fn?.body?.statements.at(-1);
  if (!finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression) return ["filters must be in the live final page return"];
  const openings = [];
  visitLive(finalReturn.expression, (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
  });
  const shell = openings.find((node) => node.tagName.getText(sf) === "ListReportShell");
  const filters = shell?.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "filters");
  const form = openings.find((node) => node.tagName.getText(sf) === "form" && filters && isDescendant(node, filters));
  if (!form) return ["filters slot must contain the live properties form"];
  const controls = openings.filter((node) => filters && isDescendant(node, filters) && ["input", "select"].includes(node.tagName.getText(sf)));
  const attributeText = (node, name) => node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === name)?.getText(sf);
  const expected = [
    ["input", 'id="property-query"', 'name="q"'],
    ["select", undefined, 'name="lifecycle"'],
    ["select", undefined, 'name="sort"'],
  ];
  for (const [tag, id, name] of expected) {
    const matches = controls.filter((node) => node.tagName.getText(sf) === tag && (!id || attributeText(node, "id") === id) && attributeText(node, "name") === name);
    if (matches.length !== 1) {
      issues.push(`filters must expose one live ${name} control`);
      continue;
    }
    const className = attributeText(matches[0], "className") ?? "";
    const classTokens = className.replace(/^className=["']|["']$/g, "").split(/\s+/);
    if (!classTokens.includes("text-base") || !classTokens.includes("sm:text-sm")) issues.push(`${name} must use a 16px mobile baseline and may compact only from sm`);
    if (classTokens.includes("text-sm")) issues.push(`${name} must not use an unscoped 14px value`);
  }
  return issues;
}

failures.push(...filterControlIssues(page));
for (const [label, mutation] of [
  ["missing mobile baseline", (source) => source.replace("text-base font-medium", "text-sm font-medium")],
  ["wrong compact breakpoint", (source) => source.replaceAll("sm:text-sm", "max-sm:text-sm")],
  ["constant-false ternary", (source) => source.replace("filters={(\n", "filters={false ? (\n").replace("          )}\n          summary=", "          ) : null}\n          summary=")],
  ["dead correct live wrong", (source) => `${source.replaceAll("text-base", "text-sm").replaceAll("sm:text-sm", "md:text-sm")}\nfunction DeadCorrectFilters(){return <><input name="q" className="min-h-11 text-base sm:text-sm"/><select name="lifecycle" className="text-base sm:text-sm"/><select name="sort" className="text-base sm:text-sm"/></>}`],
]) {
  const mutated = mutation(page);
  if (mutated === page) failures.push(`filter control synthetic ${label} did not hit its target`);
  else if (filterControlIssues(mutated).length === 0) failures.push(`filter control synthetic ${label} must fail`);
}

function headerActionIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-header.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
  const finalReturn = fn?.body?.statements.at(-1);
  if (!finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression) return ["header action must be in the live final page return"];
  const openings = [];
  const visit = (node) => {
    if (node !== finalReturn.expression && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && unwrap(node.left).kind === ts.SyntaxKind.FalseKeyword) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
    node.forEachChild(visit);
  };
  visit(finalReturn.expression);
  const header = openings.find((node) => node.tagName.getText(sf) === "PageHeader");
  if (!header) return ["live page must expose PageHeader"];
  const links = openings.filter((node) => node.tagName.getText(sf) === "Link" && isDescendant(node, header.parent));
  const action = links.filter((node) => node.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "href" && item.getText(sf) === "href={createHref}"));
  if (action.length !== 1) return ["PageHeader must expose exactly one createHref action"];
  let conditional = action[0].parent;
  while (conditional && !ts.isConditionalExpression(conditional)) conditional = conditional.parent;
  if (!conditional || conditional.condition.getText(sf) !== "canUpdateRecords") issues.push("PageHeader action must remain gated by canUpdateRecords");
  const className = action[0].attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "className")?.initializer?.getText(sf) ?? "";
  for (const token of ["inline-flex", "min-h-11", "items-center", "bg-[var(--bd-ink)]", "focus-visible:outline", "focus-visible:outline-[length:var(--bd-focus-ring-width)]", "focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"]) {
    if (!className.includes(token)) issues.push(`PageHeader action must retain ${token}`);
  }
  if (/gradient|\bfrom-|\bto-|shadow/.test(className)) issues.push("PageHeader action must not use gradients or decorative shadows");
  return issues;
}

failures.push(...headerActionIssues(page));
for (const [label, mutation] of [
  ["live gradient", (source) => source.replace("bg-[var(--bd-ink)] px-4", "bg-gradient-to-br from-[#001e40] to-[#003366] px-4 shadow-lg")],
  ["wrong gate", (source) => source.replace("{canUpdateRecords ? (", "{canArchiveRecords ? (")],
  ["dead correct live wrong", (source) => `${source.replace("bg-[var(--bd-ink)] px-4", "bg-gradient-to-br from-blue-900 to-blue-700 px-4 shadow-lg")}\nfunction DeadCorrectHeader(){return <PageHeader title="x"><Link href={createHref} className="inline-flex min-h-11 items-center bg-[var(--bd-ink)] focus-visible:outline focus-visible:outline-offset-2"/></PageHeader>}`],
]) {
  const mutated = mutation(page);
  if (mutated === page) failures.push(`header action synthetic ${label} did not hit its target`);
  else if (headerActionIssues(mutated).length === 0) failures.push(`header action synthetic ${label} must fail`);
}

function rowIdentityIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-row.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
  const finalReturn = fn?.body?.statements.at(-1);
  if (!finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression) return ["property rows must be in the live final page return"];
  const maps = [];
  visitLive(finalReturn.expression, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map" && node.expression.expression.getText(sf) === "visibleProperties") maps.push(node);
  });
  if (maps.length !== 1) return ["live results must contain one visibleProperties.map"];
  const callback = maps[0].arguments[0];
  if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) return ["property rows must use the live block mapper"];
  const rowReturn = callback.body.statements.at(-1);
  if (!rowReturn || !ts.isReturnStatement(rowReturn) || !rowReturn.expression || callback.body.statements.slice(0, -1).some(terminates)) return ["property row must end in its reachable JSX return"];
  const openings = [];
  rowReturn.expression.forEachChild(function walk(node) {
    if (ts.isFunctionLike(node)) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
    node.forEachChild(walk);
  });
  const links = openings.filter((node) => node.tagName.getText(sf) === "Link" && node.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === "data-list-return-trigger"));
  if (links.length !== 1) return ["each live row must expose one stable identity Link"];
  const link = links[0];
  const attributeText = (name) => link.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === name)?.getText(sf);
  if (attributeText("href") !== 'href={`/properties/${encodeURIComponent(property.id)}/edit?returnTo=${encodeURIComponent(returnTo)}`}') issues.push("property identity Link must preserve its exact edit returnTo href");
  if (attributeText("data-list-return-trigger") !== 'data-list-return-trigger={`property:${property.id}`}') issues.push("property identity Link must preserve its stable return trigger");
  const className = attributeText("className") ?? "";
  for (const token of ["inline-flex", "min-h-11", "max-w-full", "items-center", "break-words", "leading-relaxed", "[overflow-wrap:anywhere]", "focus-visible:outline", "focus-visible:outline-[length:var(--bd-focus-ring-width)]", "focus-visible:outline-[color:var(--bd-focus-ring-color)]", "focus-visible:outline-offset-[var(--bd-focus-ring-offset)]"]) {
    if (!className.includes(token)) issues.push(`property identity Link must retain ${token}`);
  }
  if (/\btruncate\b|line-clamp|whitespace-nowrap/.test(className)) issues.push("property identity Link must not truncate or force one line");
  return issues;
}

failures.push(...rowIdentityIssues(page));
const longIdentitySamples = [
  ["東京都港区南青山一丁目共同住宅東棟・長期管理対象物件A", "東京都港区南青山一丁目共同住宅東棟・長期管理対象物件B"],
  ["上海市浦东新区世纪大道共同住宅东栋长期管理物件甲", "上海市浦东新区世纪大道共同住宅东栋长期管理物件乙"],
  ["서울특별시강남구테헤란로공동주택동일접두어장기관리매물가", "서울특별시강남구테헤란로공동주택동일접두어장기관리매물나"],
];
if (longIdentitySamples.some(([first, second]) => first.length < 24 || second.length < 24 || first.slice(0, 12) !== second.slice(0, 12) || first === second)) failures.push("independent ja/zh/ko identity samples must stay long, prefix-similar and distinguishable");
for (const [label, mutation] of [
  ["missing touch height", (source) => source.replace("inline-flex min-h-11 max-w-full", "inline-flex max-w-full")],
  ["live truncate", (source) => source.replace("items-center break-words", "items-center truncate")],
  ["constant-false ternary", (source) => source.replace("{visibleProperties.map((property) => {", "{false ? visibleProperties.map((property) => {").replace("              })}\n", "              }) : null}\n")],
  ["dead correct live wrong", (source) => `${source.replace("inline-flex min-h-11 max-w-full items-center break-words", "block truncate")}\nfunction DeadCorrectRow(){return <Link data-list-return-trigger="dead" className="inline-flex min-h-11 max-w-full items-center break-words leading-relaxed [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-offset-2"/>}`],
]) {
  const mutated = mutation(page);
  if (mutated === page) failures.push(`row identity synthetic ${label} did not hit its target`);
  else if (rowIdentityIssues(mutated).length === 0) failures.push(`row identity synthetic ${label} must fail`);
}

function listStateIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-state.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
  const finalReturn = fn?.body?.statements.at(-1);
  if (!fn?.body || !finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression || fn.body.statements.slice(0, -1).some(terminates)) return ["state contract must bind the reachable final page return"];
  const openings = [];
  const walk = (node) => {
    if (node !== finalReturn.expression && ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && unwrap(node.left).kind === ts.SyntaxKind.FalseKeyword) return;
    if (ts.isConditionalExpression(node)) {
      const kind = unwrap(node.condition).kind;
      if (kind === ts.SyntaxKind.TrueKeyword) return walk(node.whenTrue);
      if (kind === ts.SyntaxKind.FalseKeyword) return walk(node.whenFalse);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) openings.push(node);
    node.forEachChild(walk);
  };
  walk(finalReturn.expression);
  const shell = openings.find((node) => node.tagName.getText(sf) === "ListReportShell");
  if (!shell) return ["state contract requires one live ListReportShell"];
  const getAttr = (name) => shell.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === name)?.initializer?.getText(sf) ?? "";
  if (!getAttr("summary").startsWith("{!readError ?")) issues.push("summary must be absent during readError");
  if (!getAttr("results").startsWith("{!readError && sorted.length > 0 ?")) issues.push("results must be absent for error and empty states");
  const stateText = getAttr("state");
  if (!stateText.startsWith("{readError ?") || !stateText.includes(": sorted.length === 0 ?")) issues.push("state must map error, empty and normal independently");
  const topClear = openings.filter((node) => node.tagName.getText(sf) === "Link" && node.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.getText(sf) === "href={clearHref}"));
  if (topClear.length !== 1) issues.push("filters must expose exactly one live top clear link");
  else {
    let conditional = topClear[0].parent;
    while (conditional && !ts.isConditionalExpression(conditional)) conditional = conditional.parent;
    if (!conditional || conditional.condition.getText(sf) !== "hasNonDefaultFilters") issues.push("top clear must be gated by non-default conditions");
  }
  const declarations = new Map();
  const declarationNodes = new Map();
  visitLive(fn.body, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer.getText(sf));
      declarationNodes.set(node.name.text, node.initializer);
    }
  });
  if (declarations.get("hasNonDefaultFilters") !== 'query.length > 0 || lifecycle !== "active" || sort !== "default"') issues.push("non-default filter truth table must include only q, lifecycle and sort");
  const archivedPredicate = declarationNodes.get("hasArchivedOnlyAtDefault");
  if (!archivedPredicate) issues.push("archived-only recovery must expose one live predicate");
  else {
    for (const readError of [false, true]) for (const query of ["", "x"]) for (const lifecycle of ["active", "all"]) for (const sort of ["default", "price"]) for (const properties of [[], [{}]]) for (const sorted of [[], [{}]]) {
      const expected = !readError && query.length === 0 && lifecycle === "active" && sort === "default" && properties.length > 0 && sorted.length === 0;
      let actual;
      try {
        actual = Boolean(evaluateExpression(archivedPredicate, { readError, query, lifecycle, sort, properties, sorted }));
      } catch {
        issues.push("archived-only recovery predicate must use the independently supported boolean contract");
        break;
      }
      if (actual !== expected) {
        issues.push(`archived-only recovery truth table mismatch for error=${readError}, q=${query || "empty"}, lifecycle=${lifecycle}, sort=${sort}, records=${properties.length}, visible=${sorted.length}`);
        break;
      }
    }
  }
  if (declarations.get("emptyRecoveryHref") !== "hasArchivedOnlyAtDefault ? allPropertiesHref : clearHref") issues.push("empty recovery must switch to a real all-properties URL when default active is empty");
  if (!stateText.includes("href={emptyRecoveryHref}") || !stateText.includes("hasArchivedOnlyAtDefault ? copy.viewAll : copy.clear")) issues.push("empty StateSurface must consume the live recovery URL and matching copy");
  return issues;
}

failures.push(...listStateIssues(page));
for (const [label, mutation] of [
  ["summary during error", (source) => source.replace("summary={!readError ?", "summary={true ?")],
  ["always visible clear", (source) => source.replace("{hasNonDefaultFilters ? (", "{true ? (")],
  ["same-url recovery", (source) => source.replace("hasArchivedOnlyAtDefault ? allPropertiesHref : clearHref", "hasArchivedOnlyAtDefault ? clearHref : clearHref")],
  ["or operator", (source) => source.replace("!readError &&\n    query.length === 0", "!readError ||\n    query.length === 0")],
  ["removed condition", (source) => source.replace("    sort === \"default\" &&\n", "")],
  ["reversed condition", (source) => source.replace("properties.length > 0", "properties.length === 0")],
  ["dead correct live wrong", (source) => `${source.replace("summary={!readError ?", "summary={true ?")}\nfunction DeadCorrectState(){return <ListReportShell summary={!readError ? <p/> : undefined}/>}`],
]) {
  const mutated = mutation(page);
  if (mutated === page) failures.push(`state synthetic ${label} did not hit its target`);
  else if (listStateIssues(mutated).length === 0) failures.push(`state synthetic ${label} must fail`);
}

function loadingIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-loading.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesLoading");
  const loadingCopyDeclaration = sf.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "loadingCopy");
  const copyObject = loadingCopyDeclaration?.initializer && unwrap(loadingCopyDeclaration.initializer);
  const property = (object, name) => ts.isObjectLiteralExpression(object) ? object.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(sf) === name)?.initializer : undefined;
  const expectedCopy = {
    ja: { pageTitle: "物件", description: "物件を検索し、維持管理ページへ進みます。", searchLabel: "物件を検索", results: "物件一覧", loadingTitle: "物件一覧を読み込んでいます", loadingDescription: "検索条件と物件一覧を準備しています。" },
    zh: { pageTitle: "物件", description: "查找物件并进入维护页面。", searchLabel: "查找物件", results: "物件列表", loadingTitle: "正在读取物件列表", loadingDescription: "正在准备搜索条件和物件列表。" },
    ko: { pageTitle: "매물", description: "매물을 찾아 관리 페이지로 이동합니다.", searchLabel: "매물 검색", results: "매물 목록", loadingTitle: "매물 목록을 불러오는 중입니다", loadingDescription: "검색 조건과 매물 목록을 준비하고 있습니다." },
  };
  if (!copyObject || !ts.isObjectLiteralExpression(copyObject)) issues.push("loading must expose independent top-level locale copy");
  else for (const [locale, fields] of Object.entries(expectedCopy)) {
    const localeObject = property(copyObject, locale);
    for (const [field, expected] of Object.entries(fields)) {
      const value = property(unwrap(localeObject), field);
      if (!value || !ts.isStringLiteral(value) || value.text !== expected) issues.push(`loading ${locale}.${field} must match its independent expectation`);
    }
  }
  const finalReturn = fn?.body?.statements.at(-1);
  if (!fn?.body || !finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression || fn.body.statements.slice(0, -1).some(terminates)) return ["PropertiesLoading must end in one reachable route identity return"];
  const openings = liveJsx(finalReturn.expression, []);
  const localAttr = (opening, name) => opening.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === name);
  const count = (tag) => openings.filter((node) => node.tagName.getText(sf) === tag).length;
  for (const tag of ["PageFrame", "PageHeader", "ListReportShell", "StateSurface"]) if (count(tag) !== 1) issues.push(`loading must render one live ${tag}`);
  const shell = openings.find((node) => node.tagName.getText(sf) === "ListReportShell");
  const surface = openings.find((node) => node.tagName.getText(sf) === "StateSurface");
  if (!shell || !localAttr(shell, "filters") || !localAttr(shell, "scope") || !localAttr(shell, "state")) issues.push("loading shell must preserve filters, scope and state identity");
  if (!shell || localAttr(shell, "aria-busy")?.getText(sf) !== 'aria-busy="true"') issues.push("loading shell must expose its busy state");
  if (!surface || localAttr(surface, "tone")?.getText(sf) !== 'tone="loading"') issues.push("loading state must use loading tone");
  const calls = [];
  visitLive(fn.body, (node) => { if (ts.isCallExpression(node)) calls.push(node); });
  const localeCalls = calls.filter((call) => call.expression.getText(sf) === "getLocale");
  if (localeCalls.length !== 1 || !ts.isAwaitExpression(localeCalls[0].parent)) issues.push("loading must await the live request locale exactly once");
  const copyDeclaration = fn.body.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []).find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "copy");
  if (copyDeclaration?.initializer?.getText(sf) !== "loadingCopy[locale]") issues.push("loading must select copy from the live locale");
  const filterInitializer = shell && localAttr(shell, "filters")?.initializer;
  const skeletonMaps = [];
  if (filterInitializer) visitLive(filterInitializer, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map") skeletonMaps.push(node);
  });
  const skeletonCallback = skeletonMaps[0]?.arguments[0];
  const skeletonOpening = skeletonCallback && ts.isArrowFunction(skeletonCallback) && (ts.isJsxSelfClosingElement(unwrap(skeletonCallback.body)) ? unwrap(skeletonCallback.body) : undefined);
  const skeletonClass = skeletonOpening && localAttr(skeletonOpening, "className")?.getText(sf) || "";
  if (skeletonMaps.length !== 1 || !skeletonClass.includes("animate-pulse") || !skeletonClass.includes("motion-reduce:animate-none")) issues.push("loading filter skeleton must use reduced-motion-safe live animation");
  if (/resultRange|pageCount|visibleProperties/.test(source)) issues.push("loading must not invent result counts or data rows");
  return issues;
}

failures.push(...loadingIssues(loading));
for (const [label, mutation] of [
  ["missing shell", (source) => source.replace("<ListReportShell", "<div")],
  ["dead shell", (source) => source.replace("<ListReportShell", "{false && <ListReportShell").replace("      />\n    </PageFrame>", "      />}\n    </PageFrame>")],
  ["wrong locale copy", (source) => source.replace('loadingTitle: "正在读取物件列表"', 'loadingTitle: "物件一覧を読み込んでいます"')],
  ["missing busy", (source) => source.replace('aria-busy="true"', 'aria-busy="false"')],
  ["missing reduced motion", (source) => source.replace(" motion-reduce:animate-none", "")],
  ["dead correct live wrong", (source) => source.replace(
    '{[0, 1, 2, 3].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}',
    '{false && [0].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}\n              {[1].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100" />)}',
  )],
  ["nested correct live wrong", (source) => source.replace(
    '{[0, 1, 2, 3].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}',
    '{Boolean({ dead() { return [0].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />); } }) ? null : null}\n              {[1].map((item) => <div key={item} className="min-h-11 animate-pulse rounded-lg bg-slate-100" />)}',
  )],
]) {
  const mutated = mutation(loading);
  if (mutated === loading) failures.push(`loading synthetic ${label} did not hit its target`);
  else if (loadingIssues(mutated).length === 0) failures.push(`loading synthetic ${label} must fail`);
}

function bannerIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("page-flash-banner.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PageFlashBanner");
  const finalReturn = fn?.body?.statements.at(-1);
  if (!fn?.body || !finalReturn || !ts.isReturnStatement(finalReturn) || !finalReturn.expression) return ["PageFlashBanner must retain its live final return"];
  const openings = liveJsx(finalReturn.expression, []);
  const localAttr = (opening, name) => opening.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sf) === name);
  const banner = openings.find((node) => node.tagName.getText(sf) === "div");
  if (!banner || localAttr(banner, "role")?.getText(sf) !== 'role="status"' || localAttr(banner, "aria-live")?.getText(sf) !== 'aria-live="polite"') issues.push("flash banner live region semantics must remain unchanged");
  const classText = localAttr(banner, "className")?.getText(sf) ?? "";
  if (/shadow|gradient/.test(classText)) issues.push("shared flash banner must not use decorative shadow or gradient");
  if (!classText.includes("toneClass")) issues.push("shared flash banner must retain its semantic tone mapping");
  return issues;
}

failures.push(...bannerIssues(flashBanner));
const shadowBanner = flashBanner.replace("text-sm font-medium ${toneClass}", "text-sm font-medium shadow-sm ${toneClass}");
if (shadowBanner === flashBanner) failures.push("banner shadow synthetic did not hit its target");
else if (bannerIssues(shadowBanner).length === 0) failures.push("banner shadow synthetic must fail");

function permissionDataIssues(source) {
  const issues = [];
  const sf = ts.createSourceFile("properties-permissions.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PropertiesPage");
  if (!fn?.body) return ["permission contract requires the live PropertiesPage"];
  const calls = [];
  visitLive(fn.body, (node) => {
    if (ts.isCallExpression(node)) calls.push(node);
  });
  const named = (name) => calls.filter((call) => call.expression.getText(sf) === name);
  const sessionCalls = named("requireTenantSession");
  if (sessionCalls.length !== 1 || sessionCalls[0].arguments[0]?.getText(sf) !== '{ permission: "record.read" }') issues.push("live page must require record.read exactly once");
  const contextCalls = named("createRequestContext");
  if (contextCalls.length !== 1 || contextCalls[0].arguments[0]?.getText(sf) !== "session") issues.push("live request context must derive from the authorized session");
  const capabilityCalls = named("getTenantCapability");
  if (capabilityCalls.length !== 1 || capabilityCalls[0].arguments[0]?.getText(sf) !== "session.membership") issues.push("live capability must derive from session membership");
  const permissionCalls = named("capabilityHasTenantPermission");
  const expectedPermissions = ['capability, "record.update"', 'capability, "record.archive"'];
  if (permissionCalls.length !== 2 || !expectedPermissions.every((expected) => permissionCalls.some((call) => call.arguments.map((item) => item.getText(sf)).join(", ") === expected))) issues.push("update and archive capabilities must remain independent live derivations");
  const hubCalls = named("listHubProperties");
  if (hubCalls.length !== 1 || !ts.isAwaitExpression(hubCalls[0].parent)) issues.push("live page must await one property hub read");
  else {
    const args = hubCalls[0].arguments.map((item) => item.getText(sf));
    if (args[0] !== "locale" || args[1] !== '{\n      requestContext: context,\n      lifecycleStatus: "all",\n      canUpdateRecords,\n      canArchiveRecords,\n    }') issues.push("hub read must receive locale, live context, all lifecycle and both independent capabilities");
  }
  const declarations = new Map();
  visitLive(fn.body, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer.getText(sf));
  });
  const chain = [
    ["lifecycleFiltered", ["properties", "properties.filter"]],
    ["searched", ["lifecycleFiltered", "lifecycleFiltered.filter"]],
    ["sorted", ["searched"]],
    ["visibleProperties", ["sorted.slice"]],
  ];
  for (const [name, fragments] of chain) {
    const value = declarations.get(name) ?? "";
    if (!fragments.every((fragment) => value.includes(fragment))) issues.push(`${name} must remain in the live authorized dataflow`);
  }
  const finalReturn = fn.body.statements.at(-1);
  const finalText = ts.isReturnStatement(finalReturn) ? finalReturn.expression?.getText(sf) ?? "" : "";
  if (!finalText.includes("visibleProperties.map")) issues.push("authorized visibleProperties must reach the live row renderer");
  if (!finalText.includes("canUpdateRecords ?")) issues.push("create action must consume live update capability");
  if (!finalText.includes("property.canArchive ?")) issues.push("archive action must consume each authorized object capability");
  return issues;
}

failures.push(...permissionDataIssues(page));
for (const [label, mutation] of [
  ["wrong permission", (source) => source.replace('requireTenantSession({ permission: "record.read" })', 'requireTenantSession({ permission: "record.update" })')],
  ["wrong context", (source) => source.replace("requestContext: context,", "requestContext: undefined,")],
  ["swapped capability", (source) => source.replace('capability, "record.archive"', 'capability, "record.update"')],
  ["bypass filtered data", (source) => source.replace("const searched = query\n    ? lifecycleFiltered.filter", "const searched = query\n    ? properties.filter")],
  ["dead correct dataflow", (source) => `${source.replace("const searched = query\n    ? lifecycleFiltered.filter", "const searched = query\n    ? properties.filter")}\nfunction DeadCorrectDataflow(){const searched = query ? lifecycleFiltered.filter(() => true) : lifecycleFiltered; return searched;}`],
]) {
  const mutated = mutation(page);
  if (mutated === page) failures.push(`permission/data synthetic ${label} did not hit its target`);
  else if (permissionDataIssues(mutated).length === 0) failures.push(`permission/data synthetic ${label} must fail`);
}

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}

function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

// The list adapter must carry the saved area value through both repositories.
requireText(memory, "area: item.area ?? null", "memory listQuoteFormData must return the saved area value");
requireText(postgres, "SELECT id, name, area, listing_price", "PostgreSQL properties list must select area");
requireText(postgres, "area: row.area != null ? String(row.area) : null", "PostgreSQL list mapping must preserve an empty area");
requireText(hub, "const propertyArea = typeof property.area === \"string\"", "hub must read area from the adapter");
forbidText(hub, 'property.name.includes("区")', "area must not be inferred from a property name");

// The page is a single List Report and must not expose the retired dashboard.
requireText(page, 'pageTitle: "物件"', "page identity must be an independent property title");
requireText(page, 'name="q"', "property search must use q");
requireText(page, 'name="lifecycle"', "lifecycle must be a URL filter");
requireText(page, 'name="sort"', "sort must be a URL filter");
requireText(page, 'lifecycleStatus: "all"', "the page must read all lifecycle records before filtering");
requireText(page, "const lifecycleFiltered = lifecycle === \"all\"", "lifecycle filtering must happen after the all-record read");
requireText(page, "properties.length === 0 ? copy.noProperties : copy.noResult", "empty copy must distinguish all-record empty from filtered empty");
requireText(page, "buildPropertiesHref", "page links must preserve filter and page context");
requireText(page, "const createHref = `/properties/new?returnTo=", "new property must be the only primary create route and preserve return context");
requireText(page, "/properties/${encodeURIComponent(property.id)}/edit", "property name must enter the existing edit page");
requireText(page, "<ArchiveRecordButton", "archive and restore must remain row-level risk actions");
requireText(page, 'role="table"', "results must expose a complete table role");
requireText(page, 'role="rowgroup"', "results must expose table rowgroups");
requireText(page, 'role="row"', "results must expose table rows");
requireText(page, 'role="columnheader"', "desktop results must expose column headers");
requireText(page, 'role="cell"', "results must expose table cells");
requireText(page, "<span role=\"columnheader\">{copy.area}</span>", "desktop results must label the area column");
requireText(page, "property.managementFeeValue", "the page must preserve a null fee as distinct from zero");
requireText(page, "property.repairFeeValue", "the page must preserve a null repair fee as distinct from zero");
requireText(page, "property.listingPrice > 0 ?", "non-positive listing prices must render as unset");
requireText(page, "value === null ? notSet", "null fees must render as unset while zero remains a value");
requireText(page, "property.status === \"archived\"", "lifecycle labels must use the saved active/archived states");
requireText(page, "lg:hidden", "mobile rows must retain inline field labels");

for (const [text, description] of [
  ["createPropertyQuickAction", "quick create must not be called from the List Report"],
  ["FormDraftAssist", "quick-create draft assistance must not be on the List Report"],
  ["propertyCovers", "random cover images must be removed"],
  ["/api/hub/export", "CSV export must be removed from the page"],
  ["type=\"checkbox\"", "CSV selection checkboxes must be removed"],
  ["output-center", "output links must stay outside the property list"],
  ["relationship-tree", "relationship actions must stay outside the property list"],
  ["focusId", "the page must not maintain a selected focus object"],
  ["selectedProperty", "the page must not render a second selected detail"],
  ["completion", "completion algorithms must be removed"],
  ["portfolio", "portfolio KPI/dashboard language must be removed"],
  ["min-w-[1080px]", "the page must not force a horizontal desktop table"],
  ["<ul className=\"divide-y divide-slate-200/80\"", "the results must not retain an incomplete list/table hybrid"],
]) {
  forbidText(page, text, description);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("TASK-030 List Report contract checks passed (area chain, null values, lifecycle, structure, and boundaries).");
