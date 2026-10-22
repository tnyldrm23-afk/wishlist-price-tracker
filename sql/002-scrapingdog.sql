-- Safe to apply to an existing installation; preserves all watches.
ALTER TABLE tracker.watches DROP CONSTRAINT IF EXISTS watches_source_check;
ALTER TABLE tracker.watches ADD CONSTRAINT watches_source_check
  CHECK(source IN ('demo','keepa','scrapingdog'));
