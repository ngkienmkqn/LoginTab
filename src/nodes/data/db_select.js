const BaseNode = require('../BaseNode');
const { getPool } = require('../../database/mysql');

module.exports = {
    id: 'db_select',
    name: 'Database Select',
    description: 'Select rows from database (Safe Object Mode).',
    version: '1.0.0',
    category: 'Data',
    riskLevel: 'Medium',
    capabilities: ['db:read'],
    idempotency: true,
    resourceLocks: ['db:global'],

    inputs: {
        table: { type: 'string', required: true, pattern: '^[a-zA-Z0-9_]+$' },
        where: { type: 'json', description: 'Filter conditions e.g. { "status": "active" }', default: {} },
        columns: { type: 'string', description: 'Comma-separated columns or *', default: '*' },
        limit: { type: 'number', default: 100 }
    },

    outputs: {
        result: { type: 'json' },
        count: { type: 'number' }
    },

    timeoutMs: 10000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        // RBAC Check
        if (context.security && !context.security.checkCapability(context.role, ['db:read'])) {
            throw new Error(`Access Denied: Role '${context.role}' missing capability 'db:read'`);
        }

        const pool = await getPool();

        // Build WHERE
        const whereObj = safeInputs.where;
        let clause = '';
        let params = [];
        if (whereObj && Object.keys(whereObj).length > 0) {
            const keys = Object.keys(whereObj);
            clause = 'WHERE ' + keys.map(k => `\`${k}\` = ?`).join(' AND ');
            params = keys.map(k => whereObj[k]);
        }

        // Validate Columns (Basic allowlist or regex)
        let cols = safeInputs.columns;
        if (cols !== '*' && !/^[a-zA-Z0-9_, ]+$/.test(cols)) {
            throw new Error('Invalid columns format');
        }

        const query = `SELECT ${cols} FROM \`${safeInputs.table}\` ${clause} LIMIT ?`;
        params.push(safeInputs.limit);

        const [rows] = await pool.execute(query, params);
        return { result: rows, count: rows.length };
    }
};
