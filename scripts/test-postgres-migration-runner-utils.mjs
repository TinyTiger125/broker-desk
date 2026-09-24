import assert from "node:assert/strict";
import { stripEmbeddedTransaction } from "./postgres-migration-runner-utils.mjs";

const wrapped = "\nBEGIN;\nCREATE TABLE example (id TEXT);\nCOMMIT;\n";
assert.equal(stripEmbeddedTransaction(wrapped), "CREATE TABLE example (id TEXT);");

const unwrapped = "CREATE TABLE example (id TEXT);\n";
assert.equal(stripEmbeddedTransaction(unwrapped), unwrapped);

const literal = "BEGIN;\nDO $$BEGIN RAISE NOTICE 'COMMIT;'; END$$;\nCOMMIT;";
assert.equal(stripEmbeddedTransaction(literal), "DO $$BEGIN RAISE NOTICE 'COMMIT;'; END$$;");

for (const terminator of ["END", "ABORT", "ROLLBACK"]) {
  assert.throws(
    () => stripEmbeddedTransaction(`BEGIN;\nSELECT 1;\n${terminator};\nSELECT 2;\nCOMMIT;`),
    /transaction boundary is not safely recognized/,
  );
}
assert.equal(
  stripEmbeddedTransaction("BEGIN;\nSELECT E'escaped \\' quote; END; still literal';\nSELECT 1;\nCOMMIT;"),
  "SELECT E'escaped \\' quote; END; still literal';\nSELECT 1;",
);
assert.throws(
  () => stripEmbeddedTransaction("BEGIN;\nSELECT E'escaped \\' quote';\nEND;\nCOMMIT;"),
  /transaction boundary is not safely recognized/,
);

console.log("PASS: migration runner strips only an outer embedded transaction wrapper and preserves SQL literals");
