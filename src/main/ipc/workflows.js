/**
 * Workflow IPC Handlers
 * Extracted from main.js for modularity
 */

const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../../database/mysql');

let automationManager = null;

/**
 * Set the automation manager instance
 */
function setAutomationManager(manager) {
    automationManager = manager;
}

/**
 * Register all workflow IPC handlers
 */
function registerWorkflowHandlers() {

    // Get available nodes from registry
    ipcMain.handle('get-available-nodes', async () => {
        if (!automationManager) {
            console.warn('[Workflow] AutomationManager not set');
            return [];
        }
        return automationManager.getRegistryJson();
    });

    // Save workflow (create or update)
    ipcMain.handle('save-workflow', async (event, workflow) => {
        try {
            const pool = await getPool();
            const query = `
                INSERT INTO workflows (id, name, platform, graph_data, created_by, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE name = VALUES(name), platform = VALUES(platform), graph_data = VALUES(graph_data), is_active = VALUES(is_active)
            `;
            const id = workflow.id || uuidv4();

            console.log('[SAVE] Received workflow.graph_data type:', typeof workflow.graph_data);
            const jsonData = JSON.stringify(workflow.graph_data);
            console.log('[SAVE] Stringified length:', jsonData.length);

            await pool.query(query, [id, workflow.name, workflow.platform || 'all', jsonData, workflow.createdBy || 'system', true]);
            return { success: true, id };
        } catch (e) {
            console.error('Save Workflow Error:', e);
            return { success: false, error: e.message };
        }
    });

    // Delete workflow
    ipcMain.handle('delete-workflow', async (event, id) => {
        try {
            const pool = await getPool();
            await pool.query('DELETE FROM workflows WHERE id = ?', [id]);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Clear all workflows (admin)
    ipcMain.handle('clear-all-workflows', async (event) => {
        try {
            const pool = await getPool();
            await pool.query('TRUNCATE TABLE workflows');
            console.log('[ADMIN] All workflows cleared');
            return { success: true };
        } catch (e) {
            console.error('[ADMIN] Clear workflows error:', e);
            return { success: false, error: e.message };
        }
    });

    // Get workflows (RBAC scoped)
    ipcMain.handle('get-workflows', async () => {
        const callerId = global.currentAuthUser?.id;
        if (!callerId) throw new Error('Not authenticated');

        try {
            const pool = await getPool();
            const [callers] = await pool.query('SELECT role FROM users WHERE id = ?', [callerId]);
            if (!callers.length) throw new Error('User not found');
            const role = callers[0].role;

            let query = 'SELECT id, name, platform, created_at, created_by FROM workflows';
            let params = [];

            if (role === 'super_admin') {
                query += ' ORDER BY created_at DESC';
            } else {
                query += ' WHERE created_by = ? ORDER BY created_at DESC';
                params = [callerId];
            }

            const [rows] = await pool.query(query, params);
            return rows;
        } catch (e) {
            console.error('[get-workflows] Error:', e);
            return [];
        }
    });

    // Load single workflow
    ipcMain.handle('load-workflow', async (event, id) => {
        try {
            const pool = await getPool();
            const [rows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [id]);
            if (rows.length > 0) {
                let graphData = {};
                try {
                    const rawData = rows[0].graph_data;

                    if (typeof rawData === 'string') {
                        graphData = JSON.parse(rawData);
                        console.log('[LOAD] Parsed JSON string to object');
                    } else if (typeof rawData === 'object' && rawData !== null) {
                        graphData = rawData;
                        console.log('[LOAD] Data already parsed by MySQL');
                    }

                    console.log('[LOAD] Node count:', Object.keys(graphData || {}).length);
                } catch (err) {
                    console.error('JSON Parse Error for Workflow:', err);
                }
                return { success: true, workflow: { ...rows[0], graph_data: graphData } };
            }
            return { success: false, error: 'Not found' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Run automation on profile
    ipcMain.handle('run-automation-on-profile', async (event, { profileId, workflowId }) => {
        try {
            if (!automationManager) {
                throw new Error('AutomationManager not initialized');
            }

            const BrowserManager = require('../../managers/BrowserManager');
            const launchRes = await BrowserManager.launchBrowser(profileId);
            if (!launchRes.success) return { success: false, error: launchRes.error };

            const { page } = launchRes;

            const pool = await getPool();
            const [rows] = await pool.query('SELECT * FROM workflows WHERE id = ?', [workflowId]);
            if (rows.length === 0) return { success: false, error: 'Workflow not found' };

            const workflowData = JSON.parse(rows[0].graph_data);

            const [accRows] = await pool.query('SELECT auth_config FROM accounts WHERE id = ?', [profileId]);
            const accountData = accRows[0] || {};

            let auth = accountData.auth_config || {};
            if (typeof auth === 'string') {
                try { auth = JSON.parse(auth); } catch (e) { auth = {}; }
            }

            await automationManager.runWorkflow(
                { drawflow: { Home: { data: workflowData } } },
                page,
                {},
                {
                    username: auth.username || '',
                    password: auth.password || '',
                    twofa: auth.twofaSecret || auth.twofa_secret || ''
                }
            );
            return { success: true };
        } catch (e) {
            console.error('Run Automation Error:', e);
            return { success: false, error: e.message };
        }
    });

    // Start element picker on last page
    ipcMain.handle('start-element-picker', async () => {
        try {
            const BrowserManager = require('../../managers/BrowserManager');
            if (!BrowserManager.lastPage || BrowserManager.lastPage.isClosed()) {
                return { success: false, error: 'No active browser found. Please launch a profile first.' };
            }
            const selector = await BrowserManager.startElementPicker(BrowserManager.lastPage);
            return { success: true, selector };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerWorkflowHandlers, setAutomationManager };
