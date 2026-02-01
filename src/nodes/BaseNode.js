class BaseNode {
    /**
     * Helper to validate inputs against schema
     * @param {object} inputs - Runtime inputs
     * @param {object} schema - Node input schema
     */
    static validateInputs(inputs, schema) {
        if (!schema) return inputs;
        const validated = { ...inputs };

        for (const [key, fieldDef] of Object.entries(schema)) {
            // Check Required
            if (fieldDef.required && (validated[key] === undefined || validated[key] === null || validated[key] === '')) {
                throw new Error(`Missing required input: ${key}`);
            }

            // Apply Defaults
            if (validated[key] === undefined && fieldDef.default !== undefined) {
                validated[key] = fieldDef.default;
            }

            // Type Check (Simple)
            if (validated[key] !== undefined) {
                if (fieldDef.type === 'number') {
                    const num = Number(validated[key]);
                    if (isNaN(num)) throw new Error(`Input ${key} must be a number`);
                    validated[key] = num;
                }
                // Enum Check
                if (fieldDef.enum && !fieldDef.enum.includes(validated[key])) {
                    throw new Error(`Input ${key} must be one of: ${fieldDef.enum.join(', ')}`);
                }
            }
        }
        return validated;
    }

    /**
     * Resolve variable placeholders in inputs
     * @param {object} inputs - Raw inputs
     * @param {object} context - Execution context (variables, profile)
     */
    static resolveVariables(inputs, context) {
        if (!inputs) return inputs;
        const resolved = { ...inputs };
        const data = {
            ...context.variables,
            profile: context.profile || {}
        };

        for (const [key, value] of Object.entries(resolved)) {
            if (typeof value === 'string' && value.includes('{{')) {
                resolved[key] = value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
                    const parts = path.split('.');
                    let current = data;
                    for (const part of parts) {
                        current = current?.[part];
                    }
                    if (current === undefined) console.warn(`[BaseNode] Failed to resolve variable: ${path}`);
                    else console.log(`[BaseNode] Resolved ${path} ->`, typeof current === 'string' ? `String(${current.length})` : typeof current);
                    return current !== undefined ? current : `{{${path}}}`;
                });
            }
        }
        return resolved;
    }
}

module.exports = BaseNode;
