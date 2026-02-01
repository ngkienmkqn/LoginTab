const BaseNode = require('../BaseNode');

module.exports = {
    id: 'condition',
    name: 'Condition (If/Else)',
    description: 'Evaluate a logical condition to determine flow.',
    version: '1.0.0',
    category: 'Logic',
    riskLevel: 'Low',
    capabilities: ['logic:*'],
    idempotency: true,
    resourceLocks: [],

    inputs: {
        expression: {
            type: 'string',
            required: true,
            description: 'Expression to evaluate (e.g. "x > 5 and y < 10")',
            sensitive: false
        }
    },

    outputs: {
        result: { type: 'boolean', sensitive: false }
    },

    timeoutMs: 1000, // Fast evaluation

    /**
     * Execution Logic
     * @param {object} inputs 
     * @param {object} context 
     */
    impl: async (inputs, context) => {
        // 1. Validate
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        // 2. Logic: Evaluate via Security Manager (filtrex)
        // Access SecurityManager via context.automationManager.security? 
        // Or assume context logic handles it.
        // Ideally the node just does logic. But 'evaluateExpression' is in SecurityManager.
        // We expect `context.security` to be available or we use a utility.

        // BETTER DESIGN: The AutomationManager passes `context` which includes helpers.
        if (!context.security) {
            throw new Error('Security Context missing');
        }

        // Flatten variables for filtrex
        // Filtrex expects a flat object or we pass variables
        const dataContext = { ...context.variables, ...context.secrets };

        const result = context.security.evaluateExpression(safeInputs.expression, dataContext);

        return { result: Boolean(result) };
    }
};
