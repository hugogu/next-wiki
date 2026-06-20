-- Restore the external backend selected by the most recent successful legacy
-- cutover. Migration 0007 intentionally made Database authoritative but lost
-- the old read preference by resetting every legacy is_active flag.
WITH latest_legacy_target AS (
	SELECT target_backend_id
	FROM content_migrations
	WHERE status = 'completed'
	ORDER BY finished_at DESC NULLS LAST, created_at DESC
	LIMIT 1
)
UPDATE storage_backends
SET
	replica_state = 'enabled',
	is_read_preferred = true,
	sync_completed_at = COALESCE(sync_completed_at, now()),
	updated_at = now()
WHERE id = (SELECT target_backend_id FROM latest_legacy_target)
	AND type <> 'database'
	AND replica_state = 'disabled'
	AND NOT EXISTS (
		SELECT 1
		FROM storage_backends
		WHERE is_read_preferred = true
	);
