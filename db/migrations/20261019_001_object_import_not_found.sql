BEGIN;

-- A field absent from a source is terminal evidence for that field. It is
-- different from an extraction failure and must not block completion of the
-- remaining actionable candidates. No business field is added here.
ALTER TABLE object_import_fields
  DROP CONSTRAINT IF EXISTS object_import_fields_status_check;

ALTER TABLE object_import_fields
  ADD CONSTRAINT object_import_fields_status_check CHECK (
    status IN ('draft', 'confirmed', 'rejected', 'low_confidence', 'conflict', 'failed', 'not_found')
  );

COMMIT;
