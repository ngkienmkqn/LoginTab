const BaseNode = require('../BaseNode');
const { getPool } = require('../../database/mysql');

module.exports = {
    id: 'db_write',
    name: 'Database Write',
    description: 'Insert or Update rows (Safe Object Mode).',
    version: '1.0.0',
    category: 'Data',
    riskLevel: 'High',
    capabilities: ['db:write'],
    idempotency: false,
    resourceLocks: ['db:global'],

    inputs: {
        operation: { type: 'string', enum: ['INSERT', 'UPDATE'], required: true },
        table: { type: 'string', required: true, pattern: '^[a-zA-Z0-9_]+$' },
        data: { type: 'json', required: true, description: 'Key-value pairs to write' },
        where: { type: 'json', description: 'Required for UPDATE' }
    },

    outputs: {
        affectedRows: { type: 'number' },
        insertId: { type: 'number' }
    },

    timeoutMs: 10000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (context.security && !context.security.checkCapability(context.role, ['db:write'])) {
            throw new Error(`Access Denied: Role '${context.role}' missing capability 'db:write'`);
        }

        const pool = await getPool();

        if (safeInputs.operation === 'INSERT') {
            if (!safeInputs.data || Object.keys(safeInputs.data).length === 0) throw new Error('INSERT requires data');
            const keys = Object.keys(safeInputs.data);
            const placeholders = keys.map(() => '?').join(', ');
            const query = `INSERT INTO \`${safeInputs.table}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders})`;
            const params = Object.values(safeInputs.data);

            const [res] = await pool.execute(query, params);
            return { affectedRows: res.affectedRows, insertId: res.insertId };

        } else if (safeInputs.operation === 'UPDATE') {
            if (!safeInputs.data || Object.keys(safeInputs.data).length === 0) throw new Error('UPDATE requires data');

            // STRICT SAFETY: No empty UPDATE
            if (!safeInputs.where || Object.keys(safeInputs.where).length === 0) {
                throw new Error('ERR_DB_EMPTY_WHERE: UPDATE requires a WHERE clause');
            }

            const setClause = Object.keys(safeInputs.data).map(k => `\`${k}\` = ?`).join(', ');
            const whereKeys = Object.keys(safeInputs.where);
            const whereClause = 'WHERE ' + whereKeys.map(k => `\`${k}\` = ?`).join(' AND ');

            const query = `UPDATE \`${safeInputs.table}\` SET ${setClause} ${whereClause}`;
            const params = [...Object.values(safeInputs.data), ...Object.values(safeInputs.where)];

            const [res] = await pool.execute(query, params);
            return { affectedRows: res.affectedRows, insertId: 0 };
        }
    }
};
