# next-wiki Backup and Restore

## What to Back Up

next-wiki has two persistent data stores:

| Store | Docker Volume | Contains |
|-------|--------------|----------|
| PostgreSQL | `next-wiki_db_data` | All wiki content, users, settings, history, AI records |
| Local assets | `next-wiki_assets_data` | Uploaded images, documents, draw.io files |

A complete backup requires **both**.

---

## Backup

### PostgreSQL database

```bash
# Dump to a compressed file
docker compose exec db pg_dump \
  -U nextwiki \
  -d nextwiki \
  --format=custom \
  --compress=9 \
  > backup-$(date +%Y%m%d-%H%M%S).pgdump
```

For large databases, stream directly to a remote location:

```bash
docker compose exec db pg_dump -U nextwiki nextwiki --format=custom | \
  gzip > s3://your-bucket/next-wiki-$(date +%Y%m%d).pgdump.gz
```

### Assets volume

```bash
# Create a tar archive of the assets volume
docker run --rm \
  -v next-wiki_assets_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/assets-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

---

## Restore

### PostgreSQL database

```bash
# 1. Stop the application (keep DB running)
docker compose stop web

# 2. Drop and recreate the database
docker compose exec db psql -U nextwiki -c "DROP DATABASE IF EXISTS nextwiki;"
docker compose exec db psql -U nextwiki -c "CREATE DATABASE nextwiki;"

# 3. Restore from dump
docker compose exec -T db pg_restore \
  -U nextwiki \
  -d nextwiki \
  --format=custom \
  < your-backup.pgdump

# 4. Restart the application
docker compose start web
```

### Assets volume

```bash
# 1. Stop the application
docker compose stop web

# 2. Clear the existing volume contents
docker run --rm \
  -v next-wiki_assets_data:/data \
  alpine sh -c "rm -rf /data/*"

# 3. Restore from tar archive
docker run --rm \
  -v next-wiki_assets_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/your-assets-backup.tar.gz -C /data

# 4. Restart
docker compose start web
```

---

## Verifying a Restore

After restore, verify the application starts and data is intact:

```bash
# Check process health
curl http://localhost:3000/healthz

# Check DB connectivity
curl http://localhost:3000/readyz

# Sign in at /login and confirm content is visible
```

---

## Backup Schedule (Recommended)

For production deployments, schedule regular backups using cron or your infrastructure
automation. A reasonable baseline for a team wiki:

- **Database**: daily full dump, retained for 30 days
- **Assets**: daily incremental tar, weekly full tar, retained for 14 days

next-wiki does not include built-in backup scheduling — use OS cron, Kubernetes CronJobs,
or your cloud provider's backup service.

---

## Recovery Point Objective (RPO)

With daily backups, worst-case data loss is ~24 hours. For lower RPO:

1. Use PostgreSQL streaming replication to a standby
2. Schedule more frequent dumps (every 4–6 hours)
3. Use a managed PostgreSQL service with point-in-time recovery (PITR)
