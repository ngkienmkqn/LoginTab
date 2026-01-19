const BaseNode = require('../BaseNode');

module.exports = {
    id: 'element_exists',
    name: 'Element Exists',
    description: 'Check if an element exists on the page.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: true,
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: { type: 'string', required: true },
        visible: { type: 'boolean', default: true, description: 'Check visibility too?' },
        timeout: { type: 'number', default: 5000, description: 'Wait up to X ms (0 for instant)' }
    },

    outputs: {
        exists: { type: 'boolean' }
    },

    timeoutMs: 10000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        try {
            const options = { timeout: safeInputs.timeout };
            if (safeInputs.visible) options.visible = true;

            const el = await context.page.waitForSelector(safeInputs.selector, options);
            return { exists: !!el };
        } catch (e) {
            return { exists: false };
        }
    }
};
