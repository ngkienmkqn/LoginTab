const BaseNode = require('../BaseNode');

module.exports = {
    id: 'upload_file',
    name: 'Upload File',
    description: 'Upload a file to a file input.',
    version: '1.0.0',
    category: 'Browser',
    riskLevel: 'Medium', // File Access
    capabilities: ['browser:basic', 'files:read'], // Double Capability Check
    idempotency: false,
    resourceLocks: ['browser:tab'],

    inputs: {
        selector: { type: 'string', required: true },
        filePath: { type: 'string', required: true, description: 'Absolute path to file (Sandbox restricted)' }
    },

    outputs: {
        success: { type: 'boolean' }
    },

    timeoutMs: 30000,

    impl: async (inputs, context) => {
        const safeInputs = BaseNode.validateInputs(inputs, module.exports.inputs);

        if (!context.page) throw new Error('Browser Page not available');

        // SECURITY: Sandbox Check
        if (context.security) {
            // This will Throw if invalid
            // Note: validatePath returns the resolved path (if it modifies/normalizes)
            safeInputs.filePath = context.security.validatePath(safeInputs.filePath);
        } else {
            throw new Error('Security Manager required for file operations');
        }

        // Find Element
        const elementHandle = await context.page.$(safeInputs.selector);
        if (!elementHandle) throw new Error(`File input not found: ${safeInputs.selector}`);

        // Upload
        await elementHandle.uploadFile(safeInputs.filePath);

        return { success: true };
    }
};
