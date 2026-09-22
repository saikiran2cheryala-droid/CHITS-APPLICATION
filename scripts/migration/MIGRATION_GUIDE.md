# Production Database Architecture & Migration Guide

## 1. Executive Summary & Findings

### Current Storage Architecture
- **Current Database Engine**: SQLite 3 with WAL (Write-Ahead Logging) via `better-sqlite3`.
- **Database File**: `/app/applet/data/chit_manager.db`
- **Filesystem Mount**: `none on / type overlay (rw,mode=755,uid=0,gid=0)`
- **Persistence Assessment**: **Container-Local Ephemeral Storage**.
- **Container Backup**: `/app/applet/data/backup/chit_manager_backup_sqldump.sql` (also ephemeral).

### Production Risks of Current SQLite Setup on Google Cloud Run
1. **Container Scale-to-Zero**: When Cloud Run has no active requests, it spins down container instances to zero. When a new request triggers a cold-start, a fresh container instance is spawned from the container image. Any local changes made to `/app/applet/data/chit_manager.db` during container runtime will be wiped out unless backed by an external persistent store.
2. **Redeployment / New Revision**: Every revision deployment creates new containers; ephemeral disk changes are lost.
3. **Multi-Instance Concurrency Failure**: Cloud Run scales out horizontally (e.g. Instance A and Instance B). Each instance has its own isolated local disk. Instance A's collections and payments will NOT be seen by Instance B.
4. **Network Mount / WAL Incompatibility**: SQLite's WAL mode requires shared memory (`-shm`) across processes on the *same kernel*. SQLite cannot safely coordinate concurrent writers across multiple Cloud Run instances over network mounts (NFS/GCS), risking `SQLITE_BUSY` locks or database corruption.

---

## 2. Architecture Comparison

| Architecture | Persistence | Multi-Instance | Concurrency & Integrity | Backups | Production Fit for Chit Fund |
|---|---|---|---|---|---|
| **Option A: SQLite + Persistent NFS/GCS Mount** | Yes (via Cloud Filestore or GCS FUSE) | **Unsafe** (Locking errors across instances) | **Risk of corruption**; SQLite WAL cannot share memory across multiple VMs/containers | File snapshots | Poor / High Risk for multi-instance |
| **Option B: SQLite + Cloud Run Single Instance** | Only if volume mounted & max-instances=1 | No (Strict limit to 1 instance) | Single writer only; potential bottlenecks during busy payment periods | Container volume snapshot | Workable for dev/demo only; single point of failure |
| **Option C: Google Cloud SQL (PostgreSQL)** | **100% Durable & Independent** | **Full Multi-Instance support** (Autoscaling) | **ACID transactions, Row-level locking, MVCC** | Automated point-in-time recovery (PITR) & daily snapshots | **Industry Standard & Production Recommended** |

---

## 3. Database Backup Procedure

Before executing any infrastructure or database changes, generate full backups:

### A. Portable SQL Dump
```bash
npx tsx scripts/backup_dump.ts
```
Generates `/app/applet/data/backup/chit_manager_backup_sqldump.sql` containing standard SQL DDL and `INSERT` statements for all records.

### B. SQLite Binary Snapshot
```bash
node -e '
const Database = require("better-sqlite3");
const db = new Database("data/chit_manager.db");
db.backup(`data/backup/chit_manager_backup_${Date.now()}.db`).then(() => console.log("Backup complete"));
'
```

### C. Offsite / Persistent Backup Export
Transfer the generated `.sql` and `.db` files to Google Cloud Storage or offsite encrypted storage:
```bash
gcloud storage cp data/backup/chit_manager_backup_sqldump.sql gs://<YOUR-BUCKET>/backups/
```

---

## 4. PostgreSQL / Cloud SQL Migration Procedure

### Step 1: Provision Cloud SQL PostgreSQL
Provision a Cloud SQL instance (PostgreSQL 14, 15, or 16):
```bash
gcloud sql instances create chit-manager-db \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --region=asia-southeast1 \
    --root-password="<SECURE_PASSWORD>"
```
Create database and user:
```bash
gcloud sql databases create chit_manager --instance=chit-manager-db
gcloud sql users create chit_admin --instance=chit-manager-db --password="<SECURE_PASSWORD>"
```

### Step 2: Configure Environment Variables
Set the connection URL in Secret Manager or Cloud Run service variables:
```env
DATABASE_URL=postgresql://chit_admin:<SECURE_PASSWORD>@/<INSTANCE_CONNECTION_NAME>/chit_manager?host=/cloudsql/<PROJECT_ID>:<REGION>:<INSTANCE_NAME>
```
Or for direct TCP:
```env
DATABASE_URL=postgresql://chit_admin:<SECURE_PASSWORD>@<DB_PRIVATE_IP>:5432/chit_manager
```

### Step 3: Run Pre-Migration Validation
```bash
npx tsx scripts/migration/validate_financial_data.ts
```
Ensure all mathematical balances, installment totals, and member counts are intact.

### Step 4: Execute Migration
```bash
npx tsx scripts/migration/sqlite_to_postgres.ts
```
The migration script will:
1. Extract all records from SQLite.
2. Apply `scripts/migration/schema.sql`.
3. Insert data in foreign-key dependency order within a transaction.
4. Run cross-system financial audits.

---

## 5. Rollback Procedure

If any issue arises during or after migration:

1. **Revert Connection String**: Remove `DATABASE_URL` or restore the SQLite configuration.
2. **Restore SQLite State from Backup**:
   ```bash
   cp data/backup/chit_manager_backup_1790068445496_verified.db data/chit_manager.db
   ```
3. **Verify SQLite Integrity**:
   ```bash
   npx tsx scripts/migration/validate_financial_data.ts
   ```
4. **Restart Application**:
   Restart the node process / container to reload SQLite.
