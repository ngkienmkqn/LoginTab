/**
 * Logic & Control Flow Nodes
 * Based on workflow_spec_v2.md Section 3.3.2
 */

const { CATEGORIES, RISK_LEVELS } = require('../registry');

// ============== CONDITION ==============
const condition = {
    id: 'condition',
    name: 'Condition (If/Else)',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    // Special: 2 output ports
    outputPorts: 2,

    inputs: {
        expression: {
            type: 'string',
            required: true,
            description: 'JavaScript expression (e.g., {{count}} > 5)'
        },
        leftValue: { type: 'string', description: 'Left operand' },
        operator: {
            type: 'string',
            enum: ['equals', 'not_equals', 'contains', 'greater', 'less', 'empty', 'not_empty'],
            default: 'equals'
        },
        rightValue: { type: 'string', description: 'Right operand' }
    },

    outputs: {
        result: { type: 'boolean' },
        outputPort: { type: 'number', description: '1 = true, 2 = false' }
    },

    impl: async (inputs, context) => {
        const { expression, leftValue, operator, rightValue } = inputs;
        let result = false;

        // Replace variables
        const replaceVars = (str) => {
            if (!str) return str;
            return str.replace(/\{\{(\w+)\}\}/g, (m, name) => context.variables[name] || '');
        };

        if (expression) {
            // Evaluate expression
            const evalExpr = replaceVars(expression);
            try {
                result = !!eval(evalExpr);
            } catch {
                result = false;
            }
        } else {
            // Operator-based comparison
            const left = replaceVars(leftValue);
            const right = replaceVars(rightValue);

            switch (operator) {
                case 'equals': result = left === right; break;
                case 'not_equals': result = left !== right; break;
                case 'contains': result = left.includes(right); break;
                case 'greater': result = parseFloat(left) > parseFloat(right); break;
                case 'less': result = parseFloat(left) < parseFloat(right); break;
                case 'empty': result = !left || left.trim() === ''; break;
                case 'not_empty': result = left && left.trim() !== ''; break;
            }
        }

        return { result, outputPort: result ? 1 : 2 };
    }
};

// ============== LOOP DATA ==============
const loop_data = {
    id: 'loop_data',
    name: 'Loop over Data',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        data: {
            type: 'array',
            required: true,
            description: 'Array to iterate (or variable name)'
        },
        itemVariable: {
            type: 'string',
            default: 'item',
            description: 'Variable name for current item'
        },
        indexVariable: {
            type: 'string',
            default: 'index',
            description: 'Variable name for current index'
        },
        maxIterations: {
            type: 'number',
            default: 1000,
            description: 'Safety limit'
        }
    },

    outputs: {
        completed: { type: 'boolean' },
        totalItems: { type: 'number' }
    },

    // Loop implementation is handled by executor
    isLoopStart: true,

    impl: async (inputs, context) => {
        let { data, itemVariable, indexVariable, maxIterations } = inputs;

        // Resolve variable reference
        if (typeof data === 'string') {
            data = context.variables[data] || [];
        }

        if (!Array.isArray(data)) {
            data = [data];
        }

        // Limit iterations
        const items = data.slice(0, maxIterations);

        return {
            completed: true,
            totalItems: items.length,
            _loopData: items,
            _itemVar: itemVariable,
            _indexVar: indexVariable
        };
    }
};

// ============== LOOP COUNT ==============
const loop_count = {
    id: 'loop_count',
    name: 'Loop N Times',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        count: { type: 'number', required: true, default: 5 },
        indexVariable: { type: 'string', default: 'i' }
    },

    outputs: {
        completed: { type: 'boolean' }
    },

    isLoopStart: true,

    impl: async (inputs, context) => {
        const items = Array.from({ length: inputs.count }, (_, i) => i);
        return {
            completed: true,
            _loopData: items,
            _itemVar: inputs.indexVariable,
            _indexVar: '_loopIndex'
        };
    }
};

// ============== SET VARIABLE ==============
const set_variable = {
    id: 'set_variable',
    name: 'Set Variable',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        name: { type: 'string', required: true },
        value: { type: 'any', required: true },
        scope: {
            type: 'string',
            enum: ['workflow', 'global'],
            default: 'workflow'
        }
    },

    outputs: {
        set: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { name, value, scope } = inputs;

        // Replace variables in value if string
        let finalValue = value;
        if (typeof value === 'string') {
            finalValue = value.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');
        }

        if (scope === 'global') {
            context.globalVariables = context.globalVariables || {};
            context.globalVariables[name] = finalValue;
        } else {
            context.variables[name] = finalValue;
        }

        return { set: true };
    }
};

// ============== DELAY ==============
const delay = {
    id: 'delay',
    name: 'Delay',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        duration: { type: 'number', required: true, default: 1000, description: 'Delay in ms' }
    },

    outputs: {
        waited: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        await new Promise(r => setTimeout(r, inputs.duration));
        return { waited: true };
    }
};

// ============== RANDOM DELAY ==============
const random_delay = {
    id: 'random_delay',
    name: 'Random Delay',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        minMs: { type: 'number', required: true, default: 1000 },
        maxMs: { type: 'number', required: true, default: 3000 }
    },

    outputs: {
        actualDelay: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { minMs, maxMs } = inputs;
        const actualDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        await new Promise(r => setTimeout(r, actualDelay));
        return { actualDelay };
    }
};

// ============== BREAK LOOP ==============
const break_loop = {
    id: 'break_loop',
    name: 'Break Loop',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {},
    outputs: { broken: { type: 'boolean' } },

    impl: async (inputs, context) => {
        context._breakLoop = true;
        return { broken: true };
    }
};

// ============== CONTINUE LOOP ==============
const continue_loop = {
    id: 'continue_loop',
    name: 'Continue Loop',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {},
    outputs: { continued: { type: 'boolean' } },

    impl: async (inputs, context) => {
        context._continueLoop = true;
        return { continued: true };
    }
};

// ============== STOP WORKFLOW ==============
const stop_workflow = {
    id: 'stop_workflow',
    name: 'Stop Workflow',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        reason: { type: 'string', default: 'Workflow stopped' },
        status: {
            type: 'string',
            enum: ['success', 'error', 'cancelled'],
            default: 'success'
        }
    },

    outputs: {},

    impl: async (inputs, context) => {
        context._stopWorkflow = true;
        context._stopReason = inputs.reason;
        context._stopStatus = inputs.status;
        return {};
    }
};

// ============== TRY CATCH ==============
const try_catch = {
    id: 'try_catch',
    name: 'Try-Catch',
    category: CATEGORIES.LOGIC,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    // 2 output ports: success, error
    outputPorts: 2,

    inputs: {
        catchErrors: {
            type: 'array',
            default: ['all'],
            description: 'Error types to catch'
        }
    },

    outputs: {
        success: { type: 'boolean' },
        error: { type: 'object' },
        outputPort: { type: 'number' }
    },

    // Implementation handled by executor
    isTryCatchStart: true
};

// Export all logic nodes
module.exports = {
    condition,
    loop_data,
    loop_count,
    set_variable,
    delay,
    random_delay,
    break_loop,
    continue_loop,
    stop_workflow,
    try_catch
};
