-- Drop the dead feed_items.status column (review cleanup, #454).
--
-- Per-user feed status moved to the feed_item_status table in migration 0024;
-- the feed read path (worker/feed.ts) joins that table and never reads
-- feed_items.status. The column has since always held its default 'new', and
-- idx_feed_items_status covered a constant value on every row. D1's SQLite
-- supports DROP COLUMN, so no table rebuild is needed — but the index must go
-- first (DROP COLUMN can't remove an indexed column).
DROP INDEX IF EXISTS idx_feed_items_status;
ALTER TABLE feed_items DROP COLUMN status;
