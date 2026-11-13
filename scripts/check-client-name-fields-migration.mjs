import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("db/migrations/20261114_001_client_personal_name_fields.sql", "utf8");
const postgres = readFileSync("src/lib/data.postgres.ts", "utf8");
const actions = readFileSync("src/app/actions.ts", "utf8");

for (const column of ["name_latin", "name_kanji", "name_katakana"]) {
  assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} TEXT`), `${column} must be nullable text in the local migration`);
  assert.match(postgres, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} TEXT`), `${column} must be covered by the legacy local schema path`);
  assert.match(postgres, new RegExp(column), `${column} must be mapped by the Postgres repository`);
}
assert.match(postgres, /"20261114_001_client_personal_name_fields\.sql"/, "production readiness must require the name-field migration before a real deployment gate");
assert.match(actions, /nameLatin/);
assert.match(actions, /nameKanji/);
assert.match(actions, /nameKatakana/);
assert.doesNotMatch(actions, /nameKatakana[^\n]*guess|guess[^\n]*nameKatakana/i, "katakana must not be guessed from another name field");

console.log("client personal name migration contract: PASS (three nullable columns, local schema path, repository mapping, and readiness registration)");
