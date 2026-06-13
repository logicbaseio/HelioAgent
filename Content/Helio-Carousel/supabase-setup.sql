-- ============================================================
-- HELIO — Supabase SQL Setup
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Create posts log table
CREATE TABLE IF NOT EXISTS helio_posts (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  topic         TEXT NOT NULL,
  topic_index   INT  NOT NULL DEFAULT 0,
  post_id       TEXT,
  image_urls    TEXT[],
  caption       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_helio_posts_created ON helio_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_helio_posts_status  ON helio_posts (status);

-- Useful monitoring queries

-- View all posts
SELECT id, created_at, topic, status, post_id, error
FROM helio_posts ORDER BY created_at DESC;

-- View errors only
SELECT * FROM helio_posts WHERE status = 'error' ORDER BY created_at DESC;

-- Success rate
SELECT
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'error')   as failed,
  COUNT(*)                                    as total
FROM helio_posts;
