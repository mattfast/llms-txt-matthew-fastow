ALTER TABLE sites
    ALTER COLUMN max_pages SET DEFAULT 150;

UPDATE sites
SET max_pages = 150
WHERE max_pages = 500;
