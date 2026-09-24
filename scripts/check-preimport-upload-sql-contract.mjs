import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raw = readFileSync("db/migrations/20260908_001_preimport_upload_lifecycle.sql", "utf8");
function check(raw) {
  const sql = raw.replace(/--[^\n]*/g, "");
  const body = (name) => {
    const start = sql.indexOf(`CREATE FUNCTION brokerdesk_private.${name}(`);
    assert.ok(start >= 0, name);
    return sql.slice(start, sql.indexOf("\n$$;", start));
  };
  assert.doesNotMatch(sql, /row_security\s*=\s*off|\b(?:CREATE|DROP|ALTER) POLICY|(?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY|(?:GRANT|REVOKE)[^;]*ON TABLE|ALTER ROLE|LOCK TABLE/i);
  assert.match(sql, /NOT rolsuper AND NOT rolbypassrls/);
  assert.match(sql, /pg_get_userbyid\(c.relowner\) <> 'brokerdesk_admin'/);
  assert.match(sql, /NOT c.relrowsecurity OR NOT c.relforcerowsecurity/);
  assert.match(sql, /upload_lifecycle_version INTEGER NOT NULL DEFAULT 0/);
  assert.equal((sql.match(/GRANT EXECUTE[^;]*TO brokerdesk_runtime/g) ?? []).length, 2);
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION[^;]*FROM PUBLIC/g) ?? []).length, 4);
  assert.equal((sql.match(/SET row_security = on/g) ?? []).length, 3);
  const guard = body("guard_preimport_upload_lifecycle");
  for (const field of ["id", "tenant_id", "user_id", "source_type", "target_entity", "upload_lifecycle_version", "final_import_started_at", "source_referenced_at"]) {
    assert.ok(guard.includes(`NEW.${field} IS DISTINCT FROM OLD.${field}`), `immutable ${field}`);
  }
  assert.match(guard, /current_user <> 'brokerdesk_admin'/);
  assert.match(guard, /new_notes -> 'kind' IS DISTINCT FROM old_notes -> 'kind'/);
  assert.match(guard, /NEW.final_import_started_at IS NOT NULL AND NEW.status IN \('queued', 'mapped'\)/);
  assert.match(guard, /new_notes ->> 'kind' = 'property_row_import' AND NEW.status = 'completed'/);
  const claim = body("claim_property_row_import");
  const del = body("delete_preimport_property_upload");
  for (const fn of [claim, del]) {
    for (const text of ["brokerdesk_private.current_user_id()", "brokerdesk_private.can_access_tenant(p_tenant_id)", "FOR UPDATE", "job.user_id IS DISTINCT FROM actor_id", "job.status <> 'mapped'", "job.final_import_started_at IS NOT NULL"]) assert.ok(fn.includes(text), text);
    assert.doesNotMatch(fn, /public\.(clients|properties|brokerage_cases|generated_outputs|guarantee_application_drafts)\b/);
  }
  assert.match(claim, /SET final_import_started_at = NOW\(\), status = 'processing'/);
  for (const text of ["job.upload_lifecycle_version <> 1", "job.source_referenced_at IS NOT NULL", "actor_membership.capability = 'company_owner' AND actor_membership.role = 'tenant_owner'", "actor_membership.capability = 'company_form_admin' AND actor_membership.role = 'manager'", "payload ? 'targetCaseId'", "source_count <> 1", "public.private_attachment_blobs", "INSERT INTO public.audit_logs"]) assert.ok(del.includes(text), text);
  assert.doesNotMatch(del, /role = 'platform_owner'/, "platform identity neither grants nor vetoes target-tenant authority");
  assert.match(del, /FROM public.tenants WHERE id = p_tenant_id FOR UPDATE/);
  assert.match(del, /FROM public.tenant_memberships\s+WHERE tenant_id = p_tenant_id AND user_id = actor_id FOR UPDATE/);
  assert.ok(del.indexOf("INTO actor_membership") < del.indexOf("actor_membership.capability"), "locked membership precedes final capability check");
  assert.match(del, /current_setting\('transaction_isolation'\) <> 'read committed'/);
  const order = ["FROM public.tenants", "FROM public.tenant_memberships", "FROM public.import_jobs", "SELECT COUNT(*)", "SELECT * INTO source", "FROM public.attachment_links", "DELETE FROM public.attachments", "DELETE FROM public.import_jobs", "INSERT INTO public.audit_logs"];
  assert.ok(order.every((text, i) => del.indexOf(text) >= 0 && (!i || del.indexOf(text) > del.indexOf(order[i - 1]))));
  assert.doesNotMatch(del.slice(del.indexOf("DELETE FROM public.attachments")), /EXCEPTION WHEN/);
  const source = body("guard_preimport_source_reference");
  assert.match(source, /FROM public.import_jobs WHERE id = source.target_id AND tenant_id = source.tenant_id FOR UPDATE/);
  assert.match(source, /SET source_referenced_at = NOW\(\)/);
  assert.match(source, /WHERE id = NEW.attachment_id AND tenant_id = NEW.tenant_id/);
  assert.match(source, /IF NOT FOUND THEN RAISE EXCEPTION/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public.attachment_links/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public.attachments/);
}
check(raw);
for (const [before, after] of [
  ["job.upload_lifecycle_version <> 1", "FALSE"],
  ["job.source_referenced_at IS NOT NULL", "FALSE"],
  ["NEW.final_import_started_at IS DISTINCT FROM OLD.final_import_started_at", "FALSE"],
  ["FROM public.tenants WHERE id = p_tenant_id FOR UPDATE", "FROM public.tenants WHERE id = p_tenant_id"],
  ["WHERE tenant_id = p_tenant_id AND user_id = actor_id FOR UPDATE", "WHERE tenant_id = p_tenant_id AND user_id = actor_id"],
  ["SET row_security = on", "SET row_security = off"],
  ["SET source_referenced_at = NOW()", "SET updated_at = NOW()"],
  ["FROM PUBLIC;", "FROM brokerdesk_runtime;"],
]) {
  assert.ok(raw.includes(before));
  assert.throws(() => check(raw.replace(before, after)), `mutation escaped: ${before}`);
}
console.log("[PASS] lifecycle SQL source/ACL/lock contracts + 8 mutation checks; PostgreSQL runtime NOT VERIFIED by this script");
