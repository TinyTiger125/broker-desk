-- W9.3 legacy guarantee output compatibility marker.
-- Existing guarantee PDFs are eligible for compatibility only when their
-- durable metadata and blob binding are complete. New outputs must persist
-- explicit W9.3 provenance and never inherit this legacy marker.

ALTER TABLE public.generated_outputs
  ADD COLUMN IF NOT EXISTS source_provenance_version TEXT NOT NULL DEFAULT 'legacy-unverified';

UPDATE public.generated_outputs AS output
SET source_provenance_version = 'legacy-v1'
WHERE output.source_provenance_version = 'legacy-unverified'
  AND output.output_type = 'guarantee_application'
  AND output.output_format = 'pdf'
  AND output.tenant_id IS NOT NULL
  AND output.case_id IS NOT NULL
  AND output.file_status = 'ready'
  AND output.file_attachment_id IS NOT NULL
  AND output.file_sha256 IS NOT NULL
  AND output.file_size_bytes IS NOT NULL
  AND output.file_size_bytes > 0
  AND output.file_mime_type = 'application/pdf'
  AND output.blank_form_version_id IS NOT NULL
  AND output.company_mask_version_id IS NOT NULL
  AND output.field_catalog_version IS NOT NULL
  AND output.preview_confirmation_id IS NOT NULL
  AND output.case_input_snapshot_hash IS NOT NULL
  AND output.template_id IS NOT NULL
  AND output.document_number IS NOT NULL
  AND output.input_data_snapshot IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.private_attachment_blobs AS blob
    WHERE blob.tenant_id = output.tenant_id
      AND blob.attachment_id = output.file_attachment_id
      AND blob.sha256 = output.file_sha256
      AND octet_length(blob.content) = output.file_size_bytes
  );
