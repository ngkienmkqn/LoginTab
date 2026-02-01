const BaseNode = require('../BaseNode');
const { getPool } = require('../../database/mysql');

module.exports = {
    id: 'db_delete',
    name: 'Database Delete',
    description: 'Delete rows (Safe Object Mode).',
    version: '1.0.0',
    category: 'Data',
    riskLevel: 'Critical',
    capabilities: ['db:delete'],
    idempotency: false,
    resourceLocks: ['db:global'],

    inputs: {
        table: { type: 'string', required: true, pattern: '^[a-zA-Z0-9_]+$' },
        where: { type: 'json', required: true, description: 'Filter conditions' }
    },

    outputs: {
        affectedRows: { type: 'number' }
    },

    timeoutMs: 10000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (context.security && !context.security.checkCapability(context.role, ['db:delete'])) {
            throw new Error(`Access Denied: Role '${context.role}' missing capability 'db:delete'`);
        }

        const pool = await getPool();

        // STRICT SAFETY
        if (!safeInputs.where || Object.keys(safeInputs.where).length === 0) {
            throw new Error('ERR_DB_EMPTY_WHERE: DELETE requires a WHERE clause');
        }

        const whereKeys = Object.keys(safeInputs.where);
        const whereClause = 'WHERE ' + whereKeys.map(k => `\`${k}\` = ?`).join(' AND ');
        const params = Object.values(safeInputs.where);

        const query = `DELETE FROM \`${safeInputs.table}\` ${whereClause}`;

        const [res] = await pool.execute(query, params);
        return { affectedRows: res.affectedRows };
    }
};
