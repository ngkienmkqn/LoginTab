# Database Migrations - RBAC v2

**Version:** 2.0.0  
**Migration File:** `src/database/mysql.js:155-254`  
**Last Updated:** 2026-01-18  
**Status:** ✅ COMPLETE (idempotent)

---

## Migration Summary

| Object | Type | Status |
|:---|:---|:---|
| `users.managed_by_admin_id` | Column | ✅ Migrated |
| `fk_managed_by_admin` | FK Constraint | ✅ Migrated |
| `idx_managed_by_admin` | Index | ✅ Migrated |
| `user_permissions` | Table | ✅ Migrated |
| `audit_log` | Table | ✅ Migrated |
| **Indexes Total** | 6 indexes | (1 on users + 5 on new tables) |

---

## 📋 Schema Changes

### 1. users Table Extension

#### New Column
```sql
ALTER TABLE users ADD COLUMN managed_by_admin_id VARCHAR(36) DEFAULT NULL;
```

**Purpose:** 1:1 mapping of Staff → Admin ownership  
**Nullable:** YES (unassigned Staff, Super Admin, Admin users)  
**Default:** NULL

**Code Evidence:**
```javascript
// mysql.js:158-171
const [cols] = await connection.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'managed_by_admin_id'
`);
if (cols.length === 0) {
    await connection.query(`ALTER TABLE users ADD COLUMN managed_by_admin_id VARCHAR(36) DEFAULT NULL`);
    console.log('[MySQL] Added managed_by_admin_id column to users table');
}
```

#### Foreign Key Constraint
```sql
ALTER TABLE users 
ADD CONSTRAINT fk_managed_by_admin 
FOREIGN KEY (managed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL;
```

**ON DELETE behavior:** SET NULL (if Admin deleted, Staff becomes unassigned)

**Code Evidence:**
```javascript
// mysql.js:173-186
const [fks] = await connection.query(`
    SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
    AND CONSTRAINT_NAME = 'fk_managed_by_admin'
`);
if (fks.length === 0) {
    await connection.query(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_managed_by_admin 
        FOREIGN KEY (managed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log('[MySQL] Added FK constraint for managed_by_admin_id');
}
```

#### Index
```sql
ALTER TABLE users ADD INDEX idx_managed_by_admin (managed_by_admin_id);
```

**Purpose:** Optimize scope queries (`WHERE managed_by_admin_id = ?`)

**Code Evidence:**
```javascript
// mysql.js:188-203
const [indexes] = await connection.query(`
    SELECT INDEX_NAME FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
    AND INDEX_NAME = 'idx_managed_by_admin'
`);
if (indexes.length === 0) {
    await connection.query(`ALTER TABLE users ADD INDEX idx_managed_by_admin (managed_by_admin_id)`);
    console.log('[MySQL] Added index for managed_by_admin_id');
}
```

---

### 2. user_permissions Table

```sql
CREATE TABLE IF NOT EXISTS user_permissions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_permission (user_id, permission_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Columns:**
| Column | Type | Nullable | Purpose |
|:---|:---|:---:|:---|
| `id` | VARCHAR(36) | NO | UUID primary key |
| `user_id` | VARCHAR(36) | NO | FK to users(id) |
| `permission_key` | VARCHAR(100) | NO | e.g. 'accounts.delete' |
| `enabled` | BOOLEAN | NO | Grant (TRUE) or Revoke (FALSE) |
| `created_at` | TIMESTAMP | NO | Audit trail |

**Constraints:**
- `UNIQUE KEY (user_id, permission_key)` - Prevents duplicate overrides
- `FOREIGN KEY (user_id) → users(id) ON DELETE CASCADE`

**Code Evidence:**
```javascript
// mysql.js:205-228
await connection.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        permission_key VARCHAR(100) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_permission (user_id, permission_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);
const [tables] = await connection.query(`SHOW TABLES LIKE 'user_permissions'`);
if (tables.length > 0) {
    console.log('[MySQL] user_permissions table ready');
}
```

---

### 3. audit_log Table

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    target_user_id VARCHAR(36),
    details JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_target_user_id (target_user_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp)
);
```

**Columns:**
| Column | Type | Nullable | Purpose |
|:---|:---|:---:|:---|
| `id` | INT AUTO_INCREMENT | NO | Sequential log ID |
| `action` | VARCHAR(100) | NO | e.g. 'delete_user', 'transfer_ownership' |
| `user_id` | VARCHAR(36) | NO | WHO performed the action (callerId) |
| `target_user_id` | VARCHAR(36) | YES | ON WHOM (null for non-user actions) |
| `details` | JSON | YES | Additional context |
| `timestamp` | TIMESTAMP | NO | WHEN the action occurred |

**Indexes (4):**
- `idx_user_id` - Find all actions by a user
- `idx_target_user_id` - Find all actions on a user
- `idx_action` - Find all instances of an action type
- `idx_timestamp` - Time-based queries (recent actions)

**Code Evidence:**
```javascript
// mysql.js:230-254
await connection.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        target_user_id VARCHAR(36),
        details JSON,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_target_user_id (target_user_id),
        INDEX idx_action (action),
        INDEX idx_timestamp (timestamp)
    )
`);
const [tables] = await connection.query(`SHOW TABLES LIKE 'audit_log'`);
if (tables.length > 0) {
    console.log('[MySQL] audit_log table ready');
}
```

---

## 🔄 Idempotency Strategy

### Goal
**Zero errors on repeated runs.** Restart app 10 times = clean logs every time.

### Implementation

#### Column Check (Before ALTER)
```javascript
const [cols] = await connection.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'managed_by_admin_id'
`);
if (cols.length === 0) {
    await connection.query('ALTER TABLE users ADD COLUMN...');
}
```

**Result:** No `ER_DUP_FIELDNAME` error

#### FK/Index Check (Before ADD)
```javascript
const [fks] = await connection.query(`
    SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
    WHERE TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_managed_by_admin'
`);
if (fks.length === 0) {
    await connection.query('ALTER TABLE users ADD CONSTRAINT...');
}
```

**Result:** No `ER_DUP_KEYNAME` error

#### Table Creation
```sql
CREATE TABLE IF NOT EXISTS user_permissions (...);
CREATE TABLE IF NOT EXISTS audit_log (...);
```

**Result:** Silent if table exists

#### Logging Strategy
```javascript
// Silent if already exists, log "ready" not "created"
const [tables] = await connection.query(`SHOW TABLES LIKE 'user_permissions'`);
if (tables.length > 0) {
    console.log('[MySQL] user_permissions table ready');
}
```

**Result:** Clean startup logs on restart

---

## 🔙 Rollback / Down Strategy

### Rollback Script
**File:** `docs/ai-partner/rollback-rbac-v2.sql`

```sql
-- Step 1: Drop new tables
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS audit_log;

-- Step 2: Remove FK constraint (with existence check)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                  WHERE TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_managed_by_admin');
SET @sql_drop_fk = IF(@fk_exists > 0, 
                      'ALTER TABLE users DROP FOREIGN KEY fk_managed_by_admin', 
                      'SELECT "FK constraint does not exist"');
PREPARE stmt FROM @sql_drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Remove index
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
                   WHERE TABLE_NAME = 'users' AND INDEX_NAME = 'idx_managed_by_admin');
SET @sql_drop_idx = IF(@idx_exists > 0, 
                       'ALTER TABLE users DROP INDEX idx_managed_by_admin',
                       'SELECT "Index does not exist"');
PREPARE stmt FROM @sql_drop_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Remove column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'managed_by_admin_id');
SET @sql_drop_col = IF(@col_exists > 0, 
                       'ALTER TABLE users DROP COLUMN managed_by_admin_id',
                       'SELECT "Column does not exist"');
PREPARE stmt FROM @sql_drop_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

### Rollback Usage
```bash
mysql -h <host> -P 25060 -u doadmin -p defaultdb < docs/ai-partner/rollback-rbac-v2.sql
```

**Features:**
- Idempotent (can run multiple times)
- Checks existence before DROP
- Uses prepared statements for conditional execution
- Includes verification queries

---

## 📊 Verification Queries

### After Migration (Check Success)
```sql
-- 1. Column exists
DESCRIBE users;
-- Should show: managed_by_admin_id | varchar(36) | YES | | NULL

-- 2. FK exists
SHOW CREATE TABLE users;
-- Should contain: CONSTRAINT `fk_managed_by_admin` FOREIGN KEY...

-- 3. Index exists
SHOW INDEX FROM users WHERE Key_name = 'idx_managed_by_admin';
-- Should return 1 row

-- 4. Tables created
SHOW TABLES LIKE 'user_permissions';
SHOW TABLES LIKE 'audit_log';
-- Both should return 1 row

-- 5. Indexes on audit_log
SHOW INDEX FROM audit_log;
-- Should show 5 indexes (PRIMARY + 4 custom)
```

### After Rollback (Check Clean)
```sql
-- Should all return 0 rows:
SELECT * FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'managed_by_admin_id';

SELECT * FROM information_schema.TABLE_CONSTRAINTS 
WHERE CONSTRAINT_NAME = 'fk_managed_by_admin';

SELECT * FROM information_schema.STATISTICS 
WHERE INDEX_NAME = 'idx_managed_by_admin';

SELECT * FROM information_schema.TABLES 
WHERE TABLE_NAME IN ('user_permissions', 'audit_log');
```

---

## 🛡️ Safety Guarantees

**Idempotency:** ✅ Zero errors on restart  
**Rollback:** ✅ Complete down path with existence checks  
**Data Integrity:** ✅ FK constraints with ON DELETE behavior  
**Performance:** ✅ Indexes for scope queries  
**Audit Trail:** ✅ Timestamp on all tables  

**Migration can run multiple times safely. Rollback restores to v1.x state.**
