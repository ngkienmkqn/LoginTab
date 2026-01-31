/**
 * Data Operations Nodes
 * Based on workflow_spec_v2.md Section 3.3.3
 */

const { CATEGORIES, RISK_LEVELS } = require('../registry');

// ============== DB SELECT ==============
const db_select = {
    id: 'db_select',
    name: 'Database Select',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.MEDIUM,
    capabilities: ['db:read'],

    inputs: {
        table: { type: 'string', required: true },
        columns: { type: 'string', default: '*' },
        where: { type: 'string', description: 'WHERE clause' },
        orderBy: { type: 'string' },
        limit: { type: 'number', default: 100 },
        storeAs: { type: 'string', description: 'Variable to store results' }
    },

    outputs: {
        rows: { type: 'array' },
        count: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { table, columns, where, orderBy, limit, storeAs } = inputs;
        const { db } = context;

        let sql = `SELECT ${columns} FROM ${table}`;
        if (where) sql += ` WHERE ${where}`;
        if (orderBy) sql += ` ORDER BY ${orderBy}`;
        sql += ` LIMIT ${limit}`;

        const [rows] = await db.query(sql);

        if (storeAs) {
            context.variables[storeAs] = rows;
        }

        return { rows, count: rows.length };
    }
};

// ============== DB WRITE ==============
const db_write = {
    id: 'db_write',
    name: 'Database Write',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.HIGH,
    capabilities: ['db:write'],

    inputs: {
        table: { type: 'string', required: true },
        action: {
            type: 'string',
            enum: ['insert', 'update', 'upsert'],
            default: 'insert'
        },
        data: { type: 'object', required: true },
        where: { type: 'string', description: 'WHERE for update' },
        upsertKey: { type: 'string', description: 'Key for upsert' }
    },

    outputs: {
        success: { type: 'boolean' },
        insertId: { type: 'number' },
        affectedRows: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { table, action, data, where, upsertKey } = inputs;
        const { db } = context;

        let result;

        // Replace variables in data
        const resolveData = (obj) => {
            const resolved = {};
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string') {
                    resolved[key] = value.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');
                } else {
                    resolved[key] = value;
                }
            }
            return resolved;
        };

        const finalData = resolveData(data);

        if (action === 'insert') {
            const cols = Object.keys(finalData).join(', ');
            const vals = Object.values(finalData).map(v => `'${v}'`).join(', ');
            [result] = await db.query(`INSERT INTO ${table} (${cols}) VALUES (${vals})`);
        } else if (action === 'update') {
            const sets = Object.entries(finalData).map(([k, v]) => `${k} = '${v}'`).join(', ');
            [result] = await db.query(`UPDATE ${table} SET ${sets} WHERE ${where}`);
        } else if (action === 'upsert') {
            const cols = Object.keys(finalData).join(', ');
            const vals = Object.values(finalData).map(v => `'${v}'`).join(', ');
            const updates = Object.entries(finalData).map(([k, v]) => `${k} = '${v}'`).join(', ');
            [result] = await db.query(`INSERT INTO ${table} (${cols}) VALUES (${vals}) ON DUPLICATE KEY UPDATE ${updates}`);
        }

        return {
            success: true,
            insertId: result?.insertId || 0,
            affectedRows: result?.affectedRows || 0
        };
    }
};

// ============== DB DELETE ==============
const db_delete = {
    id: 'db_delete',
    name: 'Database Delete',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.CRITICAL,
    capabilities: ['db:delete'],

    inputs: {
        table: { type: 'string', required: true },
        where: { type: 'string', required: true, description: 'WHERE clause (required!)' },
        confirmDeletion: { type: 'boolean', default: false }
    },

    outputs: {
        deleted: { type: 'boolean' },
        affectedRows: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { table, where, confirmDeletion } = inputs;
        const { db } = context;

        // Safety: require WHERE clause
        if (!where || where.trim() === '') {
            throw new Error('Database delete requires a WHERE clause for safety');
        }

        // For critical operations, require explicit confirmation
        if (!confirmDeletion && context.caller?.role !== 'super_admin') {
            throw new Error('Deletion requires confirmDeletion=true or super_admin role');
        }

        const [result] = await db.query(`DELETE FROM ${table} WHERE ${where}`);

        return { deleted: true, affectedRows: result.affectedRows };
    }
};

// ============== EXTRACT TABLE ==============
const extract_table = {
    id: 'extract_table',
    name: 'Extract HTML Table',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic', 'data:read'],

    inputs: {
        selector: { type: 'string', required: true },
        includeHeaders: { type: 'boolean', default: true },
        storeAs: { type: 'string' }
    },

    outputs: {
        data: { type: 'array' },
        headers: { type: 'array' },
        rowCount: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, includeHeaders, storeAs } = inputs;

        const result = await page.$eval(selector, (table, incHeaders) => {
            const rows = Array.from(table.querySelectorAll('tr'));
            const headers = [];
            const data = [];

            rows.forEach((row, idx) => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                const rowData = cells.map(c => c.textContent.trim());

                if (idx === 0 && incHeaders) {
                    headers.push(...rowData);
                } else {
                    data.push(rowData);
                }
            });

            return { headers, data };
        }, includeHeaders);

        if (storeAs) {
            context.variables[storeAs] = result.data;
        }

        return { ...result, rowCount: result.data.length };
    }
};

// ============== JSON PARSE ==============
const json_parse = {
    id: 'json_parse',
    name: 'Parse JSON',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['data:read'],

    inputs: {
        jsonString: { type: 'string', required: true },
        path: { type: 'string', description: 'JSON path to extract (e.g., data.items[0].name)' },
        storeAs: { type: 'string' }
    },

    outputs: {
        parsed: { type: 'any' },
        success: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { jsonString, path, storeAs } = inputs;

        try {
            let str = jsonString;
            // Replace variables
            str = str.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');

            let parsed = JSON.parse(str);

            // Extract path if specified
            if (path) {
                const parts = path.split('.');
                for (const part of parts) {
                    const match = part.match(/^(\w+)\[(\d+)\]$/);
                    if (match) {
                        parsed = parsed?.[match[1]]?.[parseInt(match[2])];
                    } else {
                        parsed = parsed?.[part];
                    }
                }
            }

            if (storeAs) {
                context.variables[storeAs] = parsed;
            }

            return { parsed, success: true };
        } catch {
            return { parsed: null, success: false };
        }
    }
};

// ============== REGEX EXTRACT ==============
const regex_extract = {
    id: 'regex_extract',
    name: 'Regex Extract',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['data:read'],

    inputs: {
        text: { type: 'string', required: true },
        pattern: { type: 'string', required: true, description: 'Regex pattern' },
        flags: { type: 'string', default: 'g' },
        group: { type: 'number', default: 0, description: 'Capture group (0 = full match)' },
        storeAs: { type: 'string' }
    },

    outputs: {
        matches: { type: 'array' },
        firstMatch: { type: 'string' },
        found: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { text, pattern, flags, group, storeAs } = inputs;

        let str = text;
        str = str.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');

        const regex = new RegExp(pattern, flags);
        const allMatches = [];
        let match;

        if (flags.includes('g')) {
            while ((match = regex.exec(str)) !== null) {
                allMatches.push(match[group] || match[0]);
            }
        } else {
            match = str.match(regex);
            if (match) {
                allMatches.push(match[group] || match[0]);
            }
        }

        if (storeAs && allMatches.length > 0) {
            context.variables[storeAs] = allMatches[0];
        }

        return {
            matches: allMatches,
            firstMatch: allMatches[0] || '',
            found: allMatches.length > 0
        };
    }
};

// ============== MATH OPERATION ==============
const math_operation = {
    id: 'math_operation',
    name: 'Math Operation',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        operation: {
            type: 'string',
            enum: ['add', 'subtract', 'multiply', 'divide', 'mod', 'power', 'floor', 'ceil', 'round'],
            required: true
        },
        operand1: { type: 'number', required: true },
        operand2: { type: 'number' },
        storeAs: { type: 'string' }
    },

    outputs: {
        result: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { operation, operand1, operand2, storeAs } = inputs;

        // Resolve variables
        const resolveNum = (n) => {
            if (typeof n === 'string' && n.startsWith('{{')) {
                const varName = n.slice(2, -2);
                return parseFloat(context.variables[varName]) || 0;
            }
            return parseFloat(n) || 0;
        };

        const a = resolveNum(operand1);
        const b = resolveNum(operand2);
        let result;

        switch (operation) {
            case 'add': result = a + b; break;
            case 'subtract': result = a - b; break;
            case 'multiply': result = a * b; break;
            case 'divide':
                if (b === 0) throw new Error('Division by zero');
                result = a / b;
                break;
            case 'mod': result = a % b; break;
            case 'power': result = Math.pow(a, b); break;
            case 'floor': result = Math.floor(a); break;
            case 'ceil': result = Math.ceil(a); break;
            case 'round': result = Math.round(a); break;
            default: result = a;
        }

        if (storeAs) {
            context.variables[storeAs] = result;
        }

        return { result };
    }
};

// ============== STRING FORMAT ==============
const string_format = {
    id: 'string_format',
    name: 'String Format',
    category: CATEGORIES.DATA,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        template: { type: 'string', required: true, description: 'Template with {{variables}}' },
        storeAs: { type: 'string' }
    },

    outputs: {
        result: { type: 'string' }
    },

    impl: async (inputs, context) => {
        const { template, storeAs } = inputs;

        const result = template.replace(/\{\{(\w+)\}\}/g, (m, name) => {
            return context.variables[name] ?? '';
        });

        if (storeAs) {
            context.variables[storeAs] = result;
        }

        return { result };
    }
};

// Export all data nodes
module.exports = {
    db_select,
    db_write,
    db_delete,
    extract_table,
    json_parse,
    regex_extract,
    math_operation,
    string_format
};
