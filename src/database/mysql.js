const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database Config
const dbConfig = {
    host: 'db-mysql-sgp1-17426-do-user-15389544-0.k.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_HG8E3MHUrdDFwcBLlde',
    database: 'defaultdb',
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function getPool() {
    if (!pool) {
        pool = mysql.createPool(dbConfig);
        console.log('[MySQL] Connection pool created.');
    }
    return pool;
}

async function initDB() {
    try {
        console.log('[MySQL] Attempting to connect to database...');
        const db = await getPool();

        // Test connection first
        const connection = await db.getConnection();
        console.log('[MySQL] Connection successful!');

        console.log('[MySQL] Initializing tables...');

        // USERS Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'staff'
            )
        `);

        // PROXIES Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS proxies (
                id VARCHAR(36) PRIMARY KEY,
                type VARCHAR(20) DEFAULT 'http',
                host VARCHAR(255) NOT NULL,
                port INT NOT NULL,
                user VARCHAR(255),
                pass VARCHAR(255)
            )
        `);

        // PLATFORMS Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS platforms (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                url VARCHAR(500)
            )
        `);

        // EXTENSIONS Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS extensions (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                path VARCHAR(500) NOT NULL
            )
        `);

        // ACCOUNTS Table (Storing complex nested data as JSON)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                loginUrl VARCHAR(500),
                proxy_config JSON,
                auth_config JSON,
                fingerprint_config JSON,
                extensions_path VARCHAR(500),
                automation_mode VARCHAR(20) DEFAULT 'auto',
                lastActive DATETIME,
                notes TEXT
            )
        `);

        // User account assignments (RBAC)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS account_assignments (
                user_id VARCHAR(36),
                account_id VARCHAR(36),
                PRIMARY KEY (user_id, account_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
        `);

        // Session Backups Table (for MySQL-based session sync)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS session_backups (
                account_id VARCHAR(36) PRIMARY KEY,
                zip_data LONGBLOB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // COOKIES Table (for Portable/Hybrid Sync)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS account_cookies (
                account_id VARCHAR(36) PRIMARY KEY,
                cookies LONGTEXT,
                local_storage LONGTEXT,
                session_storage LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
        `);

        // MIGRATION: Add local_storage and session_storage columns if they don't exist (v2.3.0)
        try {
            const [columns] = await connection.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'account_cookies'
            `);

            const columnNames = columns.map(col => col.COLUMN_NAME);

            if (!columnNames.includes('local_storage')) {
                console.log('[MySQL] Running migration: Adding local_storage column...');
                await connection.query('ALTER TABLE account_cookies ADD COLUMN local_storage LONGTEXT');
                console.log('[MySQL] ✓ local_storage column added');
            }

            if (!columnNames.includes('session_storage')) {
                console.log('[MySQL] Running migration: Adding session_storage column...');
                await connection.query('ALTER TABLE account_cookies ADD COLUMN session_storage LONGTEXT');
                console.log('[MySQL] ✓ session_storage column added');
            }
        } catch (migrationError) {
            console.error('[MySQL] Migration error (non-fatal):', migrationError.message);
        }

        // WORKFLOWS Table (for Automation System)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS workflows (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                graph_data JSON,
                created_by VARCHAR(36),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Migration: Add notes column if it doesn't exist
        try {
            await connection.query(`ALTER TABLE accounts ADD COLUMN notes TEXT`);
            console.log('[MySQL] Added notes column to accounts table');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') console.error('[MySQL] Migration error (notes):', err.message);
        }

        // Migration: Add platform_id column if it doesn't exist
        try {
            await connection.query(`ALTER TABLE accounts ADD COLUMN platform_id VARCHAR(36)`);
            console.log('[MySQL] Added platform_id column to accounts table');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') console.error('[MySQL] Migration error (platform_id):', err.message);
        }

        // Migration: Add automation_mode column if it doesn't exist
        try {
            await connection.query(`ALTER TABLE accounts ADD COLUMN automation_mode VARCHAR(20) DEFAULT 'auto'`);
            console.log('[MySQL] Added automation_mode column to accounts table');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') console.error('[MySQL] Migration error (automation_mode):', err.message);
        }

        // ==================== RBAC v2 MIGRATIONS ====================

        // Migration: Add managed_by_admin_id column to users table
        try {
            const [cols] = await connection.query(`
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
                AND COLUMN_NAME = 'managed_by_admin_id'
            `);
            if (cols.length === 0) {
                await connection.query(`ALTER TABLE users ADD COLUMN managed_by_admin_id VARCHAR(36) DEFAULT NULL`);
                console.log('[MySQL] Added managed_by_admin_id column to users table');
            }
        } catch (err) {
            console.error('[MySQL] Migration error (managed_by_admin_id):', err.message);
        }

        // Migration: Add FK constraint for managed_by_admin_id
        try {
            // Check if FK already exists
            const [fks] = await connection.query(`
                SELECT CONSTRAINT_NAME 
                FROM information_schema.TABLE_CONSTRAINTS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'users' 
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
        } catch (err) {
            console.error('[MySQL] Migration error (FK managed_by):', err.message);
        }

        // Migration: Add index for managed_by_admin_id (scope queries)
        try {
            // Check if index already exists
            const [indexes] = await connection.query(`
                SELECT INDEX_NAME 
                FROM information_schema.STATISTICS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'users' 
                AND INDEX_NAME = 'idx_managed_by_admin'
            `);

            if (indexes.length === 0) {
                await connection.query(`ALTER TABLE users ADD INDEX idx_managed_by_admin (managed_by_admin_id)`);
                console.log('[MySQL] Added index for managed_by_admin_id');
            }
        } catch (err) {
            console.error('[MySQL] Migration error (index managed_by):', err.message);
        }

        // Migration: Create user_permissions table
        try {
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
        } catch (err) {
            console.error('[MySQL] Migration error (user_permissions):', err.message);
        }

        // Migration: Create audit_log table
        try {
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
        } catch (err) {
            console.error('[MySQL] Migration error (audit_log):', err.message);
        }

        // Seed Default Admin (Safe Insert)
        await connection.query("INSERT IGNORE INTO users (id, username, password, role) VALUES ('admin-id', 'admin', 'admin', 'super_admin')");
        console.log('[MySQL] Admin checked/seeded.');

        connection.release();
        console.log('[MySQL] Tables initialized successfully.');
        return true;
    } catch (err) {
        console.error('[MySQL] Initialization Error:', err.message);
        console.error('[MySQL] Full Error:', err);
        throw err; // Re-throw to let main.js handle it
    }
}

async function getDatabaseStats() {
    try {
        const db = await getPool();
        const connection = await db.getConnection();

        // Basic Info
        const stats = {
            config: {
                host: dbConfig.host,
                port: dbConfig.port,
                user: dbConfig.user,
                database: dbConfig.database,
                ssl: !!dbConfig.ssl
            },
            status: 'Connected',
            version: '',
            tables: {}
        };

        // Get Version
        const [ver] = await connection.query('SELECT VERSION() as v');
        stats.version = ver[0].v;

        // Get Table Counts
        const tableNames = ['users', 'accounts', 'proxies', 'platforms', 'extensions', 'session_backups'];
        for (const t of tableNames) {
            try {
                const [res] = await connection.query(`SELECT COUNT(*) as c FROM ${t}`);
                stats.tables[t] = res[0].c;
            } catch (e) {
                stats.tables[t] = 'Error/Missing';
            }
        }


        // Get DB Size estimate
        try {
            const [sizeRes] = await connection.query(`
                SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb 
                FROM information_schema.tables 
                WHERE table_schema = ?
            `, [dbConfig.database]);
            stats.sizeMB = sizeRes[0].size_mb || 0;
        } catch (e) {
            stats.sizeMB = 'N/A';
        }

        // Get Pool Stats (approximate)
        stats.pool = {
            connectionLimit: dbConfig.connectionLimit,
            activeConnections: db._allConnections ? db._allConnections.length : 'N/A'
        };

        connection.release();
        return stats;
    } catch (err) {
        return {
            status: 'Error',
            error: err.message,
            config: {
                host: dbConfig.host,
                port: dbConfig.port
            }
        };
    }
}

async function resetDatabase(keepWorkflows = true) {
    try {
        const db = await getPool();
        const connection = await db.getConnection();
        console.log('[MySQL] Resetting database...');

        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        let tables = [
            'account_assignments', 'accounts', 'proxies', 'platforms', 'extensions', 'session_backups',
            'customers', 'transactions', 'crm_customers', 'crm_activities', 'question_bank_questions',
            'crm_notifications', 'crm_groups', 'crm_submissions', 'customer_lead', 'level_configs',
            'employees', 'crm_email_contacts', 'assignment_settings'
        ];

        // Also clean users but we will re-seed admin later
        tables.push('users');

        if (!keepWorkflows) {
            tables.push('workflows');
        }

        for (const t of tables) {
            try {
                // Drop if exists to be thorough (except crucial ones we might just want to truncate, but DROP is cleaner for reset)
                // Actually TRUNCATE is safer for preserving schema if we don't restart app. 
                // BUT user wants deep clean. Let's use TRUNCATE for known tables and DROP for unknown.

                // For known app tables (that initDB creates): TRUNCATE
                const appTables = ['users', 'accounts', 'proxies', 'platforms', 'extensions', 'session_backups', 'account_assignments', 'workflows'];

                if (appTables.includes(t)) {
                    await connection.query(`TRUNCATE TABLE ${t}`);
                } else {
                    await connection.query(`DROP TABLE IF EXISTS ${t}`);
                }
            } catch (e) {
                console.warn(`[MySQL] Failed to reset table ${t}:`, e.message);
            }
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        // RE-SEED ADMIN
        await connection.query("INSERT IGNORE INTO users (id, username, password, role) VALUES ('admin-id', 'admin', 'admin', 'super_admin')");
        console.log('[MySQL] Database reset complete. Admin restored.');

        connection.release();
        return true;
    } catch (err) {
        console.error('[MySQL] Reset Failed:', err);
        throw err;
    }
}

module.exports = { getPool, initDB, getDatabaseStats, resetDatabase };
