# Session Management & Sync

## 1. The Session Concept
A "Session" in Login Tab corresponds to a persistent **Chrome User Data Directory**.
- **Path**: `<appRoot>/sessions/<account_id>/`
- **Contents**: Cookies, LocalStorage, Extensions, Cache, Fingerprint files.

## 2. Synchronization (Cloud Backup)
To allow working across multiple devices (e.g., Office PC <-> Home Mac), sessions are backed up to a central MySQL BLOB storage.

### Schema
```sql
CREATE TABLE session_backups (
    account_id VARCHAR(36) PRIMARY KEY,
    session_data LONGBLOB, -- Zipped folder
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) -- SHA256 Hash for integrity
);
```

## 3. Sync Logic (`SyncManager.js`)

### 3.1 Download Flow (On Browser Launch)
1. **Check**: Is there a remote backup for this `account_id`?
2. **Compare**:
   - `Remote.last_updated` vs `Local.last_modified`.
   - `Remote.checksum` vs `Local.checksum`.
3. **Decision**:
   - If Remote is newer -> **DOWNLOAD** (Unzip & Overwrite).
   - If Local is newer/same -> **SKIP**.

### 3.2 Upload Flow (On Browser Close)
1. **Trigger**: Browser close event is detected.
2. **Action**:
   - Compress `sessions/<account_id>` folder to Buffer.
   - Calculate SHA256.
   - `INSERT ON DUPLICATE KEY UPDATE` to MySQL.
3. **Status**: Update `lastActive` timestamp on Account.

## 4. Key Considerations for AI
- **Concurrency**: Sync is blocking (await) to prevent corruption.
- **Size**: MySQL `max_allowed_packet` must be large enough to hold 50MB+ blobs.
- **Exclusions**: `Default/Cache`, `Default/Code Cache` are excluded from zip to save space (Performance Optimization).
