/**
 * Browser IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { getPool } = require('../../database/mysql');
const { auditLog } = require('../auth/audit');

const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');

/**
 * Register all browser-related IPC handlers
 */
function registerBrowserHandlers() {
    const BrowserManager = require('../../managers/BrowserManager');
    const ProxyChecker = require('../../managers/ProxyChecker');

    // Launch browser profile
    ipcMain.handle('launch-browser', async (event, arg) => {
        try {
            let accountId = arg;
            let modeOverride = null;

            if (typeof arg === 'object' && arg.id) {
                accountId = arg.id;
                modeOverride = arg.mode;
            }

            const pool = await getPool();
            console.log(`[IPC] launch-browser called for: ${accountId} (Mode: ${modeOverride})`);

            const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [accountId]);
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

            const sessionPath = path.join(SESSIONS_DIR, accountId);
            const hasLocal = await fs.pathExists(sessionPath);

            if (!hasLocal) {
                console.log('[Main] Local session missing. Starting fresh.');
            }

            const browser = await BrowserManager.launchProfile(account, modeOverride);

            browser.on('disconnected', async () => {
                const now = new Date();
                await pool.query('UPDATE accounts SET lastActive = ? WHERE id = ?', [now, accountId]);
            });

            // Execute workflow if assigned AND automation mode is 'auto'
            const automationMode = account.automation_mode || 'auto';
            console.log(`[IPC] Automation mode: ${automationMode}`);

            if (automationMode === 'manual') {
                console.log('[IPC] Manual mode - skipping workflow execution');
            } else if (account.workflow_id) {
                console.log(`[IPC] Loading workflow: ${account.workflow_id}`);

                const [workflowRows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [account.workflow_id]);
                if (workflowRows.length > 0) {
                    const workflow = workflowRows[0];
                    const graphData = typeof workflow.graph_data === 'string'
                        ? JSON.parse(workflow.graph_data)
                        : workflow.graph_data || {};

                    const workflowData = {
                        drawflow: {
                            Home: {
                                data: graphData
                            }
                        }
                    };

                    console.log(`[IPC] Executing workflow: ${workflow.name}`);

                    const page = BrowserManager.lastPage;
                    if (page) {
                        const AutomationManager = require('../../managers/AutomationManager');
                        const automationManager = new AutomationManager(BrowserManager);
                        await automationManager.runWorkflow(
                            workflowData,
                            page,
                            {},
                            {
                                username: account.auth?.username || '',
                                password: account.auth?.password || '',
                                twofa: account.auth?.twoFactorSecret || account.auth?.secret2FA || ''
                            }
                        );
                        console.log('[IPC] Workflow execution completed');
                    }
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Launch failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Kick profile user (Admin/Super Admin only)
    ipcMain.handle('kick-profile-user', async (event, { accountId, restrictionMinutes }) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();

            const [callers] = await pool.query('SELECT * FROM users WHERE id = ?', [callerId]);
            if (callers.length === 0) throw new Error('User not found');
            const caller = callers[0];

            if (caller.role !== 'admin' && caller.role !== 'super_admin') {
                throw new Error('Permission denied: Only admin/super_admin can kick users');
            }

            const [accounts] = await pool.query('SELECT * FROM accounts WHERE id = ?', [accountId]);
            if (accounts.length === 0) throw new Error('Account not found');
            const account = accounts[0];

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
                return { success: false, error: 'Profile is not currently in use' };
            }

            let restrictedUntil = null;
            if (restrictionMinutes === -1) {
                await pool.query('DELETE FROM account_assignments WHERE account_id = ? AND user_id = ?', [accountId, kickedUserId]);
                console.log(`[Kick] Removed assignment for user ${kickedUserId} from account ${accountId}`);
            } else if (restrictionMinutes > 0) {
                restrictedUntil = new Date(Date.now() + restrictionMinutes * 60000);
            }

            await pool.query(`
                UPDATE accounts SET 
                    usage_restricted_until = ?,
                    restricted_by_user_id = ?,
                    restricted_for_user_id = ?,
                    currently_used_by_user_id = NULL,
                    currently_used_by_name = NULL
                WHERE id = ?
            `, [restrictedUntil, restrictionMinutes > 0 ? callerId : null, restrictionMinutes > 0 ? kickedUserId : null, accountId]);

            await pool.query(`
                INSERT INTO profile_usage_log (account_id, user_id, username, action) 
                VALUES (?, ?, ?, 'close')
            `, [accountId, kickedUserId, kickedUsername || 'kicked']);

            // Notify clients
            const { getMainWindow } = require('../window');
            const mainWindow = getMainWindow();
            if (mainWindow) {
                mainWindow.webContents.send('force-close-browser', {
                    accountId,
                    kickedUserId,
                    kickedUsername,
                    restrictionMinutes,
                    kickedBy: caller.username
                });
            }

            await auditLog('kick_profile_user', callerId, {
                accountId,
                kickedUserId,
                kickedUsername,
                restrictionMinutes
            });

            console.log(`[Kick] ${caller.username} kicked ${kickedUsername} from ${accountId} (Restriction: ${restrictionMinutes}min)`);

            return {
                success: true,
                message: `Đã kick ${kickedUsername}${restrictionMinutes > 0 ? ` (hạn chế ${restrictionMinutes} phút)` : restrictionMinutes === -1 ? ' (thu hồi quyền)' : ''}`
            };
        } catch (error) {
            console.error('Kick failed:', error);
            return { success: false, error: error.message };
        }
    });

    // Get profile status
    ipcMain.handle('get-profile-status', async () => {
        try {
            const pool = await getPool();

            const [rows] = await pool.query(`
                SELECT pul.account_id, pul.user_id, pul.username, pul.action, pul.timestamp
                FROM profile_usage_log pul
                INNER JOIN (
                    SELECT account_id, MAX(timestamp) as max_ts
                    FROM profile_usage_log
                    GROUP BY account_id
                ) latest ON pul.account_id = latest.account_id AND pul.timestamp = latest.max_ts
                WHERE pul.action = 'open'
            `);

            const statusMap = {};
            rows.forEach(row => {
                statusMap[row.account_id] = {
                    userId: row.user_id,
                    username: row.username || 'Unknown'
                };
            });
            return { success: true, status: statusMap };
        } catch (err) {
            console.error('[IPC] get-profile-status error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // Get profile usage history
    ipcMain.handle('get-profile-usage-history', async (event, accountId) => {
        try {
            const pool = await getPool();
            const [rows] = await pool.query(`
                SELECT user_id, username, action, timestamp 
                FROM profile_usage_log 
                WHERE account_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 100
            `, [accountId]);
            return { success: true, history: rows };
        } catch (err) {
            console.error('[IPC] get-profile-usage-history error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // Check proxy health
    ipcMain.handle('check-proxy-health', async (event, proxy) => {
        try {
            const healthScore = await ProxyChecker.checkProxyHealth(proxy);
            return {
                success: true,
                score: healthScore,
                label: ProxyChecker.getHealthLabel(healthScore),
                color: ProxyChecker.getHealthColor(healthScore)
            };
        } catch (error) {
            return { success: false, score: 0 };
        }
    });

    // Check if window is focused
    ipcMain.handle('is-window-focused', async (event) => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        const { getMainWindow } = require('../window');
        const mainWindow = getMainWindow();
        return mainWindow?.isFocused() || false;
    });
}

module.exports = { registerBrowserHandlers };
