const TRANSACTION_CONTROL_WORDS = new Set(["BEGIN", "COMMIT", "END", "ROLLBACK", "ABORT", "START"]);

function isWhitespace(char) {
  return typeof char === "string" && /\s/.test(char);
}

function skipQuotedString(sql, start, quote, backslashEscapes = false) {
  let index = start + 1;
  while (index < sql.length) {
    if (backslashEscapes && sql[index] === "\\") {
      index += 2;
      continue;
    }
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  throw new Error("migration contains an unterminated quoted string");
}

function skipLineComment(sql, start) {
  const newline = sql.indexOf("\n", start + 2);
  return newline < 0 ? sql.length : newline + 1;
}

function skipBlockComment(sql, start) {
  let depth = 1;
  let index = start + 2;
  while (index < sql.length) {
    if (sql.startsWith("/*", index)) {
      depth += 1;
      index += 2;
      continue;
    }
    if (sql.startsWith("*/", index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
      continue;
    }
    index += 1;
  }
  throw new Error("migration contains an unterminated block comment");
}

function readDollarTag(sql, start) {
  if (sql[start] !== "$") return null;
  const match = sql.slice(start).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match ? match[0] : null;
}

function skipDollarQuotedString(sql, start, tag) {
  const end = sql.indexOf(tag, start + tag.length);
  if (end < 0) throw new Error("migration contains an unterminated dollar-quoted string");
  return end + tag.length;
}

function scanTopLevelStatements(sql) {
  const statements = [];
  let statementStart = 0;
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (char === "-" && sql[index + 1] === "-") {
      index = skipLineComment(sql, index);
      continue;
    }
    if (char === "/" && sql[index + 1] === "*") {
      index = skipBlockComment(sql, index);
      continue;
    }
    if (char === "'" || char === '"') {
      // PostgreSQL E'...' and U&'...' literals can escape a quote with a
      // backslash. A premature quote close could hide a later END/COMMIT.
      const previous = sql[index - 1];
      const escapedPrefix = (previous === "E" || previous === "e")
        && (index < 2 || !/[A-Za-z0-9_$]/.test(sql[index - 2]));
      const unicodePrefix = previous === "&" && /[Uu]/.test(sql[index - 2] ?? "")
        && (index < 3 || !/[A-Za-z0-9_$]/.test(sql[index - 3]));
      index = skipQuotedString(sql, index, char, char === "'" && (escapedPrefix || unicodePrefix));
      continue;
    }
    const dollarTag = readDollarTag(sql, index);
    if (dollarTag) {
      index = skipDollarQuotedString(sql, index, dollarTag);
      continue;
    }
    if (char === ";") {
      statements.push({ start: statementStart, end: index + 1 });
      statementStart = index + 1;
    }
    index += 1;
  }
  if (stripTrivia(sql.slice(statementStart))) statements.push({ start: statementStart, end: sql.length });
  return statements;
}

function stripTrivia(value) {
  let index = 0;
  while (index < value.length) {
    if (isWhitespace(value[index])) {
      index += 1;
      continue;
    }
    if (value.startsWith("--", index)) {
      index = skipLineComment(value, index);
      continue;
    }
    if (value.startsWith("/*", index)) {
      index = skipBlockComment(value, index);
      continue;
    }
    break;
  }
  let end = value.length;
  while (end > index && isWhitespace(value[end - 1])) end -= 1;
  return value.slice(index, end);
}

function topLevelControl(statement) {
  const body = stripTrivia(statement);
  const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)([\s\S]*)$/);
  if (!match) return null;
  const keyword = match[1].toUpperCase();
  if (!TRANSACTION_CONTROL_WORDS.has(keyword)) return null;
  return { keyword, remainder: match[2].replace(/;\s*$/, "").trim() };
}

function transactionWrapperError(reason) {
  return new Error(`migration transaction boundary is not safely recognized: ${reason}`);
}

/**
 * Remove only a file-level BEGIN/COMMIT wrapper. SQL comments, quoted strings,
 * function bodies, and dollar-quoted blocks are ignored while finding the
 * top-level statements. The original bytes must still be used for checksums.
 */
export function stripEmbeddedTransaction(sql) {
  if (typeof sql !== "string") throw new TypeError("migration SQL must be a string");
  const statements = scanTopLevelStatements(sql);
  const controls = statements
    .map((statement) => topLevelControl(sql.slice(statement.start, statement.end)))
    .filter(Boolean);
  if (controls.length === 0) return sql;
  if (controls.length !== 2 || controls[0].keyword !== "BEGIN" || controls[1].keyword !== "COMMIT") {
    throw transactionWrapperError("top-level transaction control must be exactly BEGIN ... COMMIT");
  }
  if (controls[0].remainder && !/^(?:WORK|TRANSACTION)$/i.test(controls[0].remainder)) {
    throw transactionWrapperError("BEGIN options are not supported");
  }
  if (controls[1].remainder && !/^WORK$/i.test(controls[1].remainder)) {
    throw transactionWrapperError("COMMIT options are not supported");
  }
  const first = statements.find((statement) => topLevelControl(sql.slice(statement.start, statement.end)));
  const last = [...statements].reverse().find((statement) => topLevelControl(sql.slice(statement.start, statement.end)));
  if (!first || !last || first !== statements[0] || last !== statements[statements.length - 1]) {
    throw transactionWrapperError("BEGIN and COMMIT must wrap the complete file");
  }
  const body = sql.slice(first.end, last.start).trim();
  if (!stripTrivia(body)) throw transactionWrapperError("transaction wrapper cannot contain an empty migration");
  return body;
}

export function assertSafeMigrationSql(sql, name = "migration") {
  try {
    return stripEmbeddedTransaction(sql);
  } catch (error) {
    throw new Error(`${name} was rejected before execution: ${error.message}`);
  }
}

export const EMPTY_DATABASE_PREREQUISITE_TABLES = Object.freeze([
  "import_jobs",
  "attachments",
  "private_attachment_blobs",
  "attachment_links",
  "audit_logs",
]);

export function buildEmptyDatabasePrerequisiteSql({ ownershipRole = null } = {}) {
  if (ownershipRole !== null && !/^[a-z_][a-z0-9_]*$/i.test(ownershipRole)) {
    throw new Error("ownershipRole must be a plain PostgreSQL role identifier");
  }
  const ownershipRoleSql = ownershipRole ? ` TO ${ownershipRole}` : " TO brokerdesk_admin";
  const ownership = EMPTY_DATABASE_PREREQUISITE_TABLES
    .map((table) => ownershipRole
      ? `ALTER TABLE public.${table} OWNER${ownershipRoleSql};`
      : `ALTER TABLE public.${table} OWNER${ownershipRoleSql};\nALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    .join("\n");
  const rowSecurity = EMPTY_DATABASE_PREREQUISITE_TABLES
    .map((table) => `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`)
    .join("\n");
  const ownershipSql = ownershipRole ? `${ownership}\nSET ROLE ${ownershipRole};\n${rowSecurity}\nRESET ROLE;` : ownership;
  return {
    createRoles: `DO $$
DECLARE
  role_row RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_runtime') THEN
    CREATE ROLE brokerdesk_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'brokerdesk_admin') THEN
    CREATE ROLE brokerdesk_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  FOR role_row IN SELECT rolname, rolsuper, rolcreaterole, rolbypassrls, rolcanlogin FROM pg_catalog.pg_roles WHERE rolname IN ('brokerdesk_runtime', 'brokerdesk_admin') LOOP
    IF role_row.rolsuper OR role_row.rolcreaterole OR role_row.rolbypassrls OR role_row.rolcanlogin THEN
      RAISE EXCEPTION 'empty database prerequisite role has unsafe attributes: %', role_row.rolname USING ERRCODE = '42501';
    END IF;
  END LOOP;
END
$$;`,
    ownership: ownershipSql,
  };
}
