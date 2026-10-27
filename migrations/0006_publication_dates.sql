-- Older articles did not store first-publication time separately. Freeze their
-- saved timestamp as an explicitly estimated date; do not change article text.
UPDATE articles SET data=json_set(data,'$.publishedAt',updated_at,'$.publicationDateEstimated',json('true'))
WHERE status='published' AND json_extract(data,'$.publishedAt') IS NULL;
