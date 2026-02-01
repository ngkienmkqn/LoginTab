/**
 * Audit Logging Module
 * Extracted from main.js for modularity
 */

const { getPool } = require('../../database/mysql');

/**
 * Log an action to audit_log table
 */
async function auditLog(action, userId, details) {
    try {
        const pool = await getPool();
        await pool.execute(
            `INSERT INTO audit_log (action, user_id, target_user_id, details, timestamp) 
             VALUES (?, ?, ?, ?, NOW())`,
            [
                action,
                userId,
                details.targetUserId || null,
                JSON.stringify(details)
            ]
        );
        console.log(`[AUDIT] ${action} by ${userId}:`, details);
    } catch (error) {
        console.error('[AUDIT] Failed to log:', error);
    }
}

/**
 * Get audit logs for a user or action
 */
async function getAuditLogs(filters = {}) {
    try {
        const pool = await getPool();
        let query = 'SELECT * FROM audit_log WHERE 1=1';
        const params = [];

        if (filters.userId) {
            query += ' AND user_id = ?';
            params.push(filters.userId);
        }
        if (filters.action) {
            query += ' AND action = ?';
            params.push(filters.action);
        }
        if (filters.since) {
            query += ' AND timestamp >= ?';
            params.push(filters.since);
        }

        query += ' ORDER BY timestamp DESC LIMIT 100';

        const [logs] = await pool.query(query, params);
        return logs;
    } catch (error) {
        console.error('[AUDIT] Failed to get logs:', error);
        return [];
    }
}

module.exports = {
    auditLog,
    getAuditLogs
};
