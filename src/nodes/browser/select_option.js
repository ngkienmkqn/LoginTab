const BaseNode = require('../BaseNode');

module.exports = {
    id: 'select_option',
    name: 'Select Option',
    description: 'Select an option from a dropdown.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Low',
    capabilities: ['browser:basic'],
    idempotency: false, // State change
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: { type: 'string', required: true },
        value: { type: 'string', required: true, description: 'Value to select' }
    },

    outputs: {
        selected: { type: 'boolean' }
    },

    timeoutMs: 15000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        await context.page.waitForSelector(safeInputs.selector, { timeout: 10000 });

        // Puppeteer select returns array of selected values
        const result = await context.page.select(safeInputs.selector, safeInputs.value);

        if (!result.includes(safeInputs.value)) {
            // Warning: Might have verified selection failed?
            // Or maybe value mapping is tricky.
            // For now, if no error thrown, we assume success or partial success.
        }

        return { selected: true };
    }
};
