-- Unified person/property master profile fields.
-- All additions are nullable so existing tenants and legacy rows remain valid.
-- Case confirmedDataJson is deliberately untouched: these are reusable master
-- attributes, while a case keeps its own confirmed snapshot.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS furigana TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS current_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS current_address TEXT,
  ADD COLUMN IF NOT EXISTS employer_name TEXT,
  ADD COLUMN IF NOT EXISTS employer_address TEXT,
  ADD COLUMN IF NOT EXISTS employer_phone TEXT,
  ADD COLUMN IF NOT EXISTS annual_income INTEGER,
  ADD COLUMN IF NOT EXISTS annual_income_as_of DATE,
  ADD COLUMN IF NOT EXISTS annual_income_source TEXT;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS furigana TEXT,
  ADD COLUMN IF NOT EXISTS room_number TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS usage TEXT,
  ADD COLUMN IF NOT EXISTS listing_rent INTEGER,
  ADD COLUMN IF NOT EXISTS listing_common_fee INTEGER;
