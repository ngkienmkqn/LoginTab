/**
 * Login Tab - Express.js Server
 * Replaces Electron main process for Windows N compatibility
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Database & Managers
const { initDB, getPool, getDatabaseStats, resetDatabase } = require('./src/database/mysql');
const BrowserManager = require('./src/managers/BrowserManager');
const ProxyChecker = require('./src/managers/ProxyChecker');
const AutomationManager = require('./src/managers/AutomationManager');
const FingerprintGenerator = require('./src/utils/FingerprintGenerator');

// ==================== Constants ====================
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(os.homedir(), '.login-tab');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// ==================== Session Management ====================
global.currentAuthUser = null; // { id, username, role }

// ==================== Express Setup ====================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/ui')));

// ==================== Authorization Helpers ====================
async function checkScope(caller, target) {
    if (caller.role === 'super_admin') return true;
    if (caller.role === 'admin') {
        if (target.id === caller.id) return true;
        return target.managed_by_admin_id === caller.id;
    }
    return false;
}

async function checkPermission(userId, permissionKey) {
    try {
        const pool = await getPool();
        const [overrides] = await pool.query(
            'SELECT enabled FROM user_permissions WHERE user_id = ? AND permission_key = ?',
            [userId, permissionKey]
        );
        if (overrides.length > 0) {
            return overrides[0].enabled === 1;
        }
        const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return false;
        const role = users[0].role;
        const roleDefaults = {
            super_admin: ['users.view', 'users.edit', 'users.delete', 'users.create', 'accounts.view', 'accounts.edit', 'accounts.delete', 'accounts.create'],
            admin: ['users.view', 'users.edit', 'users.create', 'accounts.view', 'accounts.edit', 'accounts.create'],
            staff: ['accounts.view']
        };
        return (roleDefaults[role] || []).includes(permissionKey);
    } catch (error) {
        console.error('[Permission] Check failed:', error);
        return false;
    }
}

async function authorize(callerId, action, targetId) {
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) return false;
        const caller = callers[0];
        if (targetId) {
            const [targets] = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
            if (targets.length === 0) return false;
            const target = targets[0];
            const hasScope = await checkScope(caller, target);
            if (!hasScope) return false;
        }
        return await checkPermission(callerId, action);
    } catch (error) {
        console.error('[Auth] Error:', error);
        return false;
    }
}

async function auditLog(action, userId, details) {
    try {
        const pool = await getPool();
        await pool.execute(
            `INSERT INTO audit_log (action, user_id, target_user_id, details, timestamp) VALUES (?, ?, ?, ?, NOW())`,
            [action, userId, details.targetUserId || null, JSON.stringify(details)]
        );
        console.log(`[AUDIT] ${action} by ${userId}:`, details);
    } catch (error) {
        console.error('[AUDIT] Failed to log:', error);
    }
}

// Auth middleware for API routes
function requireAuth(req, res, next) {
    if (!global.currentAuthUser) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    req.user = global.currentAuthUser;
    next();
}

// ==================== API Routes ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: require('./package.json').version });
});

// --- AUTHENTICATION ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const pool = await getPool();
        if (username === 'admin' && password === 'Kien123!!') {
            const [rows] = await pool.query('SELECT * FROM users WHERE username = "admin"');
            let user;
            if (rows.length === 0) {
                const id = uuidv4();
                await pool.query('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
                    [id, 'admin', 'Kien123!!', 'super_admin']);
                user = { id, username: 'admin', role: 'super_admin' };
            } else {
                user = rows[0];
            }
            global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
            console.log('[Auth] Login successful:', global.currentAuthUser);
            return res.json({ success: true, user: global.currentAuthUser });
        }
        const [rows] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (rows.length > 0) {
            const user = rows[0];
            global.currentAuthUser = { id: user.id, username: user.username, role: user.role };
            console.log('[Auth] Login successful:', global.currentAuthUser);
            return res.json({ success: true, user: global.currentAuthUser });
        }
        res.json({ success: false, error: 'Invalid credentials' });
    } catch (e) {
        console.error(e);
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    console.log('[Auth] Logout:', global.currentAuthUser);
    global.currentAuthUser = null;
    res.json({ success: true });
});

app.get('/api/auth/session', (req, res) => {
    res.json({ user: global.currentAuthUser });
});

// --- ACCOUNTS ---
app.get('/api/accounts', requireAuth, async (req, res) => {
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];
        let query, params;
        if (caller.role === 'super_admin') {
            query = `SELECT a.*, (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM account_assignments aa JOIN users u ON aa.user_id = u.id WHERE aa.account_id = a.id) as assignedUsers FROM accounts a`;
            params = [];
        } else if (caller.role === 'admin') {
            query = `SELECT DISTINCT a.*, (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM account_assignments aa JOIN users u ON aa.user_id = u.id WHERE aa.account_id = a.id) as assignedUsers FROM accounts a LEFT JOIN account_assignments aa ON a.id = aa.account_id WHERE aa.user_id IN (SELECT id FROM users WHERE managed_by_admin_id = ? OR id = ?)`;
            params = [callerId, callerId];
        } else {
            query = `SELECT a.*, (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM account_assignments aa JOIN users u ON aa.user_id = u.id WHERE aa.account_id = a.id) as assignedUsers FROM accounts a JOIN account_assignments aa ON a.id = aa.account_id WHERE aa.user_id = ?`;
            params = [callerId];
        }
        const [accounts] = await pool.query(query, params);
        res.json(accounts.map(row => ({
            ...row,
            assignedUsers: row.assignedUsers || 'None',
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config
        })));
    } catch (error) {
        console.error('[get-accounts] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/accounts', requireAuth, async (req, res) => {
    const { name, loginUrl, proxy, fingerprint, auth, extensionsPath, notes, platformId, workflowId } = req.body;
    try {
        const pool = await getPool();
        const id = uuidv4();
        const newAccount = {
            id, name,
            loginUrl: loginUrl || '',
            extensions_path: extensionsPath || '',
            proxy_config: JSON.stringify(proxy || {}),
            fingerprint_config: JSON.stringify(FingerprintGenerator.generateFingerprint(id)),
            auth_config: JSON.stringify(auth || {}),
            notes: notes || '',
            platform_id: platformId || null,
            workflow_id: workflowId || null
        };
        await pool.query(
            'INSERT INTO accounts (id, name, loginUrl, proxy_config, auth_config, fingerprint_config, extensions_path, lastActive, notes, platform_id, workflow_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, newAccount.name, newAccount.loginUrl, newAccount.proxy_config, newAccount.auth_config, newAccount.fingerprint_config, newAccount.extensions_path, null, newAccount.notes, newAccount.platform_id, newAccount.workflow_id]
        );
        if (global.currentAuthUser?.id) {
            await pool.query('INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)', [global.currentAuthUser.id, id]);
        }
        res.json({ success: true, account: { ...newAccount, proxy, fingerprint, auth } });
    } catch (error) {
        console.error('[create-account] Failed:', error);
        res.json({ success: false, error: error.message });
    }
});

app.put('/api/accounts/:id', requireAuth, async (req, res) => {
    const updatedData = req.body;
    updatedData.id = req.params.id;
    try {
        const pool = await getPool();
        await pool.query(
            'UPDATE accounts SET name = ?, loginUrl = ?, proxy_config = ?, auth_config = ?, fingerprint_config = ?, extensions_path = ?, notes = ?, platform_id = ?, workflow_id = ? WHERE id = ?',
            [updatedData.name, updatedData.loginUrl || '', JSON.stringify(updatedData.proxy || {}), JSON.stringify(updatedData.auth || {}), JSON.stringify(updatedData.fingerprint || {}), updatedData.extensionsPath || '', updatedData.notes || '', updatedData.platformId || null, updatedData.workflowId || null, updatedData.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/accounts/:id', requireAuth, async (req, res) => {
    const accountId = req.params.id;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const hasPermission = await checkPermission(callerId, 'accounts.delete');
        if (!hasPermission) throw new Error('Unauthorized');
        await pool.query('DELETE FROM accounts WHERE id = ?', [accountId]);
        await pool.query('DELETE FROM session_backups WHERE account_id = ?', [accountId]);
        const sessionPath = path.join(SESSIONS_DIR, accountId);
        await fs.remove(sessionPath);
        await auditLog('delete_account', callerId, { targetAccountId: accountId });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.put('/api/accounts/:id/notes', requireAuth, async (req, res) => {
    const { notes } = req.body;
    try {
        const pool = await getPool();
        await pool.query('UPDATE accounts SET notes = ? WHERE id = ?', [notes, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// --- BROWSER LAUNCH ---
app.post('/api/browser/launch', requireAuth, async (req, res) => {
    const { id, mode } = req.body;
    try {
        const pool = await getPool();
        console.log(`[API] launch-browser called for: ${id} (Mode: ${mode})`);
        const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [id]);
        if (rows.length === 0) throw new Error('Account not found');
        const row = rows[0];
        const account = {
            ...row,
            proxy: typeof row.proxy_config === 'string' ? JSON.parse(row.proxy_config) : row.proxy_config,
            fingerprint: typeof row.fingerprint_config === 'string' ? JSON.parse(row.fingerprint_config) : row.fingerprint_config,
            auth: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : row.auth_config,
            extensionsPath: row.extensions_path,
            automation_mode: row.automation_mode || 'auto'
        };
        const browser = await BrowserManager.launchProfile(account, mode);
        browser.on('disconnected', async () => {
            const now = new Date();
            await pool.query('UPDATE accounts SET lastActive = ? WHERE id = ?', [now, id]);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Launch failed:', error);
        res.json({ success: false, error: error.message });
    }
});

// --- KICK PROFILE USER (Multi-machine support) ---
app.post('/api/browser/kick', requireAuth, async (req, res) => {
    const { accountId, restrictionMinutes } = req.body;
    const callerId = req.user.id;

    try {
        const pool = await getPool();

        // Check caller permissions
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];

        if (caller.role !== 'admin' && caller.role !== 'super_admin') {
            throw new Error('Permission denied: Only admin/super_admin can kick users');
        }

        // Get account info
        const [accounts] = await pool.query('SELECT * FROM accounts WHERE id = ?', [accountId]);
        if (accounts.length === 0) throw new Error('Account not found');
        const account = accounts[0];

        // Find who to kick
        const [latestLogs] = await pool.query(`
            SELECT user_id, username, action FROM profile_usage_log 
            WHERE account_id = ? 
            ORDER BY timestamp DESC LIMIT 1
        `, [accountId]);

        let kickedUserId = account.currently_used_by_user_id;
        let kickedUsername = account.currently_used_by_name;

        if (!kickedUserId && latestLogs.length > 0 && latestLogs[0].action === 'open') {
            kickedUserId = latestLogs[0].user_id;
            kickedUsername = latestLogs[0].username;
        }

        if (!kickedUserId) {
            return res.json({ success: false, error: 'Profile is not currently in use' });
        }

        // Handle restriction
        let restrictedUntil = null;
        if (restrictionMinutes === -1) {
            await pool.query('DELETE FROM account_assignments WHERE account_id = ? AND user_id = ?', [accountId, kickedUserId]);
            console.log(`[Kick] Removed assignment for user ${kickedUserId} from account ${accountId}`);
        } else if (restrictionMinutes > 0) {
            restrictedUntil = new Date(Date.now() + restrictionMinutes * 60000);
        }

        // Update database
        await pool.query(`
            UPDATE accounts SET 
                usage_restricted_until = ?,
                restricted_by_user_id = ?,
                restricted_for_user_id = ?,
                currently_used_by_user_id = NULL,
                currently_used_by_name = NULL
            WHERE id = ?
        `, [restrictedUntil, restrictionMinutes > 0 ? callerId : null, restrictionMinutes > 0 ? kickedUserId : null, accountId]);

        // Log close action
        await pool.query(`
            INSERT INTO profile_usage_log (account_id, user_id, username, action) 
            VALUES (?, ?, ?, 'close')
        `, [accountId, kickedUserId, kickedUsername || 'kicked']);

        // Force close browser on THIS server (if running locally)
        const browserClosed = await BrowserManager.closeBrowserByAccountId(accountId);
        if (browserClosed) {
            console.log(`[Kick] ✓ Browser forcefully closed for account: ${accountId}`);
        }

        // BROADCAST to ALL connected clients via Socket.IO
        // This notifies staff on OTHER machines to close their browser
        io.emit('force-close-browser', {
            accountId,
            kickedUserId,
            kickedUsername,
            restrictionMinutes,
            kickedBy: caller.username
        });
        console.log(`[Kick] Socket.IO broadcast sent to all clients`);

        // Audit log
        await auditLog('kick_profile_user', callerId, {
            accountId,
            kickedUserId,
            kickedUsername,
            restrictionMinutes
        });

        console.log(`[Kick] ${caller.username} kicked ${kickedUsername} from ${accountId} (Restriction: ${restrictionMinutes}min)`);

        res.json({
            success: true,
            message: `Đã kick ${kickedUsername}${restrictionMinutes > 0 ? ` (hạn chế ${restrictionMinutes} phút)` : restrictionMinutes === -1 ? ' (thu hồi quyền)' : ''}`
        });
    } catch (error) {
        console.error('Kick failed:', error);
        res.json({ success: false, error: error.message });
    }
});

// --- PROXIES ---
app.get('/api/proxies', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM proxies');
        res.json(rows);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/proxies', requireAuth, async (req, res) => {
    const proxy = req.body;
    try {
        const pool = await getPool();
        if (proxy.id) {
            await pool.query('UPDATE proxies SET type = ?, host = ?, port = ?, user = ?, pass = ? WHERE id = ?',
                [proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass, proxy.id]);
        } else {
            await pool.query('INSERT INTO proxies (id, type, host, port, user, pass) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), proxy.type, proxy.host, proxy.port, proxy.user, proxy.pass]);
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/proxies/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM proxies WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/proxies/check', requireAuth, async (req, res) => {
    try {
        const healthScore = await ProxyChecker.checkProxyHealth(req.body);
        res.json({
            success: true,
            score: healthScore,
            label: ProxyChecker.getHealthLabel(healthScore),
            color: ProxyChecker.getHealthColor(healthScore)
        });
    } catch (error) {
        res.json({ success: false, score: 0 });
    }
});

// --- EXTENSIONS ---
app.get('/api/extensions', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM extensions');
        res.json(rows);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/extensions', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('INSERT INTO extensions (id, name, path) VALUES (?, ?, ?)',
            [uuidv4(), req.body.name, req.body.path]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/extensions/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM extensions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// --- PLATFORMS ---
app.get('/api/platforms', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM platforms');
        res.json(rows);
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/platforms', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('INSERT INTO platforms (id, name, url) VALUES (?, ?, ?)',
            [uuidv4(), req.body.name, req.body.url]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.put('/api/platforms/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('UPDATE platforms SET name = ?, url = ? WHERE id = ?',
            [req.body.name, req.body.url, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/platforms/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM platforms WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// --- USERS ---
app.get('/api/users', requireAuth, async (req, res) => {
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        if (callers.length === 0) throw new Error('User not found');
        const caller = callers[0];
        const hasPermission = await checkPermission(callerId, 'users.view');
        if (!hasPermission) throw new Error('Unauthorized');
        if (caller.role === 'staff') throw new Error('Access denied');

        let query, params;
        if (caller.role === 'super_admin') {
            query = `SELECT u.id, u.username, u.role, u.managed_by_admin_id, COUNT(DISTINCT aa.account_id) as assigned_accounts_count FROM users u LEFT JOIN account_assignments aa ON u.id = aa.user_id GROUP BY u.id, u.username, u.role, u.managed_by_admin_id`;
            params = [];
        } else {
            query = `SELECT u.id, u.username, u.role, u.managed_by_admin_id, COUNT(DISTINCT aa.account_id) as assigned_accounts_count FROM users u LEFT JOIN account_assignments aa ON u.id = aa.user_id WHERE u.managed_by_admin_id = ? OR u.id = ? GROUP BY u.id, u.username, u.role, u.managed_by_admin_id`;
            params = [callerId, callerId];
        }
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', requireAuth, async (req, res) => {
    const { username, password, role } = req.body;
    const callerId = req.user.id;
    try {
        const authorized = await authorize(callerId, 'users.create', null);
        if (!authorized) throw new Error('Unauthorized');
        const pool = await getPool();
        const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
        const caller = callers[0];
        const id = uuidv4();
        const managedBy = (caller.role === 'admin' && role === 'staff') ? callerId : null;
        await pool.query('INSERT INTO users (id, username, password, role, managed_by_admin_id) VALUES (?, ?, ?, ?, ?)',
            [id, username, password, role, managedBy]);
        await auditLog('create_user', callerId, { newUserId: id, username, role });
        res.json({ success: true, user: { id, username, role } });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
    const userId = req.params.id;
    const { username, password, role } = req.body;
    const callerId = req.user.id;
    try {
        const authorized = await authorize(callerId, 'users.edit', userId);
        if (!authorized) throw new Error('Unauthorized');
        const pool = await getPool();
        await pool.query('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?',
            [username, password, role, userId]);
        await auditLog('update_user', callerId, { targetUserId: userId, username });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
    const userId = req.params.id;
    const callerId = req.user.id;
    try {
        const authorized = await authorize(callerId, 'users.delete', userId);
        if (!authorized) throw new Error('Unauthorized');
        const pool = await getPool();
        const [targets] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        await auditLog('delete_user', callerId, { targetUserId: userId, username: targets[0]?.username });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get user's assigned accounts with details
app.get('/api/users/:id/assigned-accounts', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query(`
            SELECT a.id, a.name as profile_name, p.name as platform_name 
            FROM accounts a 
            JOIN account_assignments aa ON a.id = aa.account_id 
            LEFT JOIN platforms p ON a.platform_id = p.id 
            WHERE aa.user_id = ?
        `, [req.params.id]);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Get available accounts for assignment
app.get('/api/users/:id/available-accounts', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query(`
            SELECT a.id, a.name as profile_name, p.name as platform_name 
            FROM accounts a 
            LEFT JOIN platforms p ON a.platform_id = p.id 
            WHERE a.id NOT IN (SELECT account_id FROM account_assignments WHERE user_id = ?)
        `, [req.params.id]);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Transfer user ownership
app.post('/api/users/:id/transfer', requireAuth, async (req, res) => {
    const userId = req.params.id;
    const { newAdminId } = req.body;
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        if (callers[0]?.role !== 'super_admin') throw new Error('Only Super Admin can transfer');
        await pool.query('UPDATE users SET managed_by_admin_id = ? WHERE id = ?', [newAdminId || null, userId]);
        await auditLog('transfer_user', callerId, { targetUserId: userId, newAdminId });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- WORKFLOWS ---
app.get('/api/workflows', requireAuth, async (req, res) => {
    const callerId = req.user.id;
    try {
        const pool = await getPool();
        const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
        const role = callers[0]?.role;
        let query = 'SELECT id, name, platform, created_at, created_by FROM workflows';
        let params = [];
        if (role === 'super_admin') {
            query += ' ORDER BY created_at DESC';
        } else {
            query += ' WHERE created_by = ? ORDER BY created_at DESC';
            params = [callerId];
        }
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

app.get('/api/workflows/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            let graphData = rows[0].graph_data;
            if (typeof graphData === 'string') {
                graphData = JSON.parse(graphData);
            }
            res.json({ success: true, workflow: { ...rows[0], graph_data: graphData } });
        } else {
            res.json({ success: false, error: 'Not found' });
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/workflows', requireAuth, async (req, res) => {
    const workflow = req.body;
    try {
        const pool = await getPool();
        const id = workflow.id || uuidv4();
        const jsonData = JSON.stringify(workflow.graph_data);
        await pool.query(
            `INSERT INTO workflows (id, name, platform, graph_data, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), platform = VALUES(platform), graph_data = VALUES(graph_data), is_active = VALUES(is_active)`,
            [id, workflow.name, workflow.platform || 'all', jsonData, workflow.createdBy || 'system', true]
        );
        res.json({ success: true, id });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.delete('/api/workflows/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.query('DELETE FROM workflows WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- DATABASE ---
app.get('/api/database/stats', requireAuth, async (req, res) => {
    res.json(await getDatabaseStats());
});

app.post('/api/database/reset', requireAuth, async (req, res) => {
    console.log('[API] Database reset request');
    try {
        await resetDatabase(true);
        await initDB();
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// --- FINGERPRINT ---
app.post('/api/fingerprint/preview', requireAuth, async (req, res) => {
    const { currentId, os } = req.body;
    try {
        const id = currentId || 'PREVIEW_' + Date.now();
        const fp = FingerprintGenerator.generateFingerprint(id, os || 'win');
        res.json({ success: true, fingerprint: fp });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- ASSIGNMENTS ---
app.get('/api/assignments/:userId', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [rows] = await pool.query('SELECT account_id FROM account_assignments WHERE user_id = ?', [req.params.userId]);
        res.json(rows.map(r => r.account_id));
    } catch (e) {
        res.json([]);
    }
});

app.put('/api/assignments/:userId', requireAuth, async (req, res) => {
    const { accountIds } = req.body;
    const userId = req.params.userId;
    try {
        const pool = await getPool();
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM account_assignments WHERE user_id = ?', [userId]);
            for (const accId of accountIds) {
                await connection.query('INSERT INTO account_assignments (user_id, account_id) VALUES (?, ?)', [userId, accId]);
            }
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/bulk-assign', requireAuth, async (req, res) => {
    const { accountIds, userIds } = req.body;
    try {
        const pool = await getPool();
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const accId of accountIds) {
                for (const uId of userIds) {
                    await connection.query('INSERT IGNORE INTO account_assignments (user_id, account_id) VALUES (?, ?)', [uId, accId]);
                }
            }
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/bulk-revoke', requireAuth, async (req, res) => {
    const { accountIds, userIds } = req.body;
    try {
        const pool = await getPool();
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const accId of accountIds) {
                for (const uId of userIds) {
                    await connection.query('DELETE FROM account_assignments WHERE user_id = ? AND account_id = ?', [uId, accId]);
                }
            }
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.get('/api/eligible-users', requireAuth, async (req, res) => {
    const role = req.user.role;
    try {
        const pool = await getPool();
        let query = '';
        if (role === 'super_admin') {
            query = "SELECT id, username, role FROM users WHERE role IN ('admin', 'staff')";
        } else if (role === 'admin') {
            query = "SELECT id, username, role FROM users WHERE role = 'staff'";
        } else {
            return res.json([]);
        }
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// --- AUTOMATION NODES ---
const automationManager = new AutomationManager(BrowserManager);
app.get('/api/automation/nodes', requireAuth, (req, res) => {
    res.json(automationManager.getRegistryJson());
});

// Fallback: Serve index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/ui/index.html'));
});

// ==================== Socket.IO Events ====================
io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('[Socket] Client disconnected:', socket.id);
    });
});

// ==================== Initialize ====================
async function start() {
    try {
        console.log('[Server] Initializing...');
        console.log('[Server] Data directory:', DATA_DIR);

        await fs.ensureDir(SESSIONS_DIR);
        await initDB();

        server.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════╗
║                    LOGIN TAB v${require('./package.json').version}                  ║
║                   Express.js Server                   ║
╠═══════════════════════════════════════════════════════╣
║  Open in browser: http://localhost:${PORT}              ║
╚═══════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('[Server] Failed to start:', error);
        process.exit(1);
    }
}

start();
