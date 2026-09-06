-- feed_items carried no index at all. The only one it ever had was
-- idx_feed_items_status, dropped in 0047, and the UNIQUE(source, external_id)
-- autoindex cannot serve the feed page: EXPLAIN QUERY PLAN returned
-- "SCAN feed_items ... USE TEMP B-TREE FOR ORDER BY". Every page read the
-- whole table and sorted it by hand, on a tier that bills rows read, for a
-- table that grows with every ingest and is never pruned.
--
-- The sort key is an expression, so this index has to carry the same one — a
-- plain index on posted_at would not be matched against
-- COALESCE(posted_at, ''). The COALESCE is what keeps rows with no posted_at
-- sorting last rather than dropping out of a keyset cursor comparison.
--
-- Both columns DESC to match the ORDER BY, and id second because it is the
-- tiebreak that makes (sortKey, id) a stable cursor.
CREATE INDEX idx_feed_items_posted
  ON feed_items (COALESCE(posted_at, '') DESC, id DESC);
