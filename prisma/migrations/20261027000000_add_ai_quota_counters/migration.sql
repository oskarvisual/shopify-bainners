-- Add daily AI quota counters to Shop.
-- The authoritative counters live in the n8n Data Table; these columns are
-- a local mirror used for fast UI rendering and as a fallback.

ALTER TABLE `Shop` ADD COLUMN `aiGenerationsToday` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `Shop` ADD COLUMN `aiGenerationsDate` DATE NULL;
ALTER TABLE `Shop` ADD COLUMN `aiUploadsToday` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `Shop` ADD COLUMN `aiUploadsDate` DATE NULL;
