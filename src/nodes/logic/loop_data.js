const BaseNode = require('../BaseNode');

module.exports = {
    id: 'loop_data',
    name: 'Loop Over Data',
    description: 'Iterate over a list of items.',
    version: '1.0.0',
    category: 'Logic',
    riskLevel: 'Low',
    capabilities: ['logic:*'],
    idempotency: true,
    resourceLocks: [],

    inputs: {
        data: { type: 'array', required: true, description: 'Array to iterate' },
        maxIterations: { type: 'number', default: 1000, description: 'Safety limit' }
    },

    outputs: {
        item: { type: 'any' },
        index: { type: 'number' }
        // Engine handles 'body' vs 'done' based on flow connections usually
    },

    // Custom Flow Logic hint for Engine? 
    // For now, we just implement the "Next Item" logic. 
    // The Engine needs to know this is a Loop.
    // We'll mark it in schema?
    isLoop: true,

    timeoutMs: 1000,

    impl: async (inputs, context) => {
        // This node logic is tricky without engine support. 
        // Usually a loop node is stateful.
        // context.loopState needs to track index.

        // For Phase 3, we'll keep it simple: 
        // This node doesn't "run" the loop. It just returns the current item given a state.
        // OR we assume the Engine handles the looping structure.

        // Let's implement basic validation.
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!Array.isArray(safeInputs.data)) {
            throw new Error('Input data must be an array');
        }

        // Safety Cap
        if (safeInputs.data.length > safeInputs.maxIterations) {
            console.warn(`[Loop] Data length ${safeInputs.data.length} exceeds max ${safeInputs.maxIterations}. Truncating.`);
            safeInputs.data.length = safeInputs.maxIterations;
        }

        return {
            data: safeInputs.data,
            count: safeInputs.data.length
        };
    }
};
