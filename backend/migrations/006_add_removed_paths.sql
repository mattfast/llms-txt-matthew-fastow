-- llms_txt_versions.changed_paths previously mixed together modified, added, and removed
-- pages, which could make "N changed pages" exceed the site's current page count (e.g. a
-- site whose discovered page set churns between crawls). Split "removed" out into its own
-- column so the two can never be conflated again.
ALTER TABLE llms_txt_versions
    ADD COLUMN IF NOT EXISTS removed_paths JSON NOT NULL DEFAULT '[]';
