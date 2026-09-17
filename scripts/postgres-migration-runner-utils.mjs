export function stripEmbeddedTransaction(sql) {
  const leading = sql.match(/^\s*BEGIN\s*;\s*/i);
  const trailing = sql.match(/\s*COMMIT\s*;\s*$/i);
  if (!leading || !trailing) return sql;
  return sql.slice(leading[0].length, sql.length - trailing[0].length);
}
