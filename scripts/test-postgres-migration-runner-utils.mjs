import assert from "node:assert/strict";
import { stripEmbeddedTransaction } from "./postgres-migration-runner-utils.mjs";

const wrapped = "\nBEGIN;\nCREATE TABLE example (id TEXT);\nCOMMIT;\n";
assert.equal(stripEmbeddedTransaction(wrapped), "CREATE TABLE example (id TEXT);");

const unwrapped = "CREATE TABLE example (id TEXT);\n";
assert.equal(stripEmbeddedTransaction(unwrapped), unwrapped);

const literal = "BEGIN;\nDO $$BEGIN RAISE NOTICE 'COMMIT;'; END$$;\nCOMMIT;";
assert.equal(stripEmbeddedTransaction(literal), "DO $$BEGIN RAISE NOTICE 'COMMIT;'; END$$;");

console.log("PASS: migration runner strips only an outer embedded transaction wrapper and preserves SQL literals");
