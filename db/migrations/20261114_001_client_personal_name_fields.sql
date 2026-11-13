-- Persist the three separate personal-name representations for individual
-- clients. Nullable columns preserve legacy records and corporate names.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS name_latin TEXT,
  ADD COLUMN IF NOT EXISTS name_kanji TEXT,
  ADD COLUMN IF NOT EXISTS name_katakana TEXT;
