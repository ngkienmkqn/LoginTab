/**
 * Special & Debug Nodes
 * Based on workflow_spec_v2.md Section 3.3.5
 */

const { CATEGORIES, RISK_LEVELS } = require('../registry');
const speakeasy = require('speakeasy');

// ============== KEYBOARD ACTION ==============
const keyboard_action = {
    id: 'keyboard_action',
    name: 'Keyboard Action',
    category: CATEGORIES.ACTION,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        action: {
            type: 'string',
            enum: ['press', 'down', 'up', 'type'],
            default: 'press'
        },
        key: { type: 'string', required: true, description: 'Key or key combination' },
        modifiers: {
            type: 'array',
            default: [],
            description: 'Modifier keys: Shift, Control, Alt, Meta'
        },
        delay: { type: 'number', default: 0 }
    },

    outputs: {
        executed: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { action, key, modifiers, delay } = inputs;

        // Hold modifier keys
        for (const mod of modifiers) {
            await page.keyboard.down(mod);
        }

        if (action === 'press') {
            await page.keyboard.press(key, { delay });
        } else if (action === 'down') {
            await page.keyboard.down(key);
        } else if (action === 'up') {
            await page.keyboard.up(key);
        } else if (action === 'type') {
            await page.keyboard.type(key, { delay });
        }

        // Release modifier keys
        for (const mod of modifiers.reverse()) {
            await page.keyboard.up(mod);
        }

        return { executed: true };
    }
};

// ============== LOG DEBUG ==============
const log_debug = {
    id: 'log_debug',
    name: 'Debug Log',
    category: CATEGORIES.DEBUG,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['logic:*'],

    inputs: {
        message: { type: 'string', required: true },
        level: { type: 'string', enum: ['info', 'warn', 'error', 'debug'], default: 'info' },
        includeVariables: { type: 'boolean', default: false },
        maskSensitive: { type: 'boolean', default: true }
    },

    outputs: {
        logged: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { message, level, includeVariables, maskSensitive } = inputs;
        const { logger } = context;

        // Replace variables in message
        let finalMessage = message.replace(/\{\{(\w+)\}\}/g, (m, n) => context.variables[n] || '');

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message: finalMessage,
            nodeId: context.currentNodeId,
            runId: context.runId
        };

        if (includeVariables) {
            let vars = { ...context.variables };

            // Mask sensitive fields
            if (maskSensitive) {
                const sensitiveKeys = ['password', 'secret', 'token', 'key', 'auth', '2fa', 'otp'];
                for (const key of Object.keys(vars)) {
                    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
                        vars[key] = '***MASKED***';
                    }
                }
            }

            logEntry.variables = vars;
        }

        if (logger) {
            logger.log(logEntry);
        } else {
            console[level](JSON.stringify(logEntry));
        }

        return { logged: true };
    }
};

// ============== GENERATE 2FA ==============
const generate_2fa = {
    id: 'generate_2fa',
    name: 'Generate 2FA Code',
    category: CATEGORIES.ACTION,
    riskLevel: RISK_LEVELS.MEDIUM,
    capabilities: ['browser:advanced'],

    inputs: {
        secret: { type: 'string', required: true, description: 'TOTP secret key' },
        algorithm: { type: 'string', enum: ['sha1', 'sha256', 'sha512'], default: 'sha1' },
        digits: { type: 'number', default: 6 },
        period: { type: 'number', default: 30 },
        storeAs: { type: 'string', default: 'otpCode' }
    },

    outputs: {
        code: { type: 'string' },
        remainingSeconds: { type: 'number' }
    },

    impl: async (inputs, context) => {
        const { secret, algorithm, digits, period, storeAs } = inputs;

        // Resolve variable if needed
        let finalSecret = secret;
        if (secret.startsWith('{{')) {
            const varName = secret.slice(2, -2);
            finalSecret = context.variables[varName] || context.profile?.twofa_secret || '';
        }

        // Clean secret (remove spaces)
        finalSecret = finalSecret.replace(/\s/g, '').toUpperCase();

        const code = speakeasy.totp({
            secret: finalSecret,
            encoding: 'base32',
            algorithm,
            digits,
            step: period
        });

        // Calculate remaining time
        const remainingSeconds = period - (Math.floor(Date.now() / 1000) % period);

        if (storeAs) {
            context.variables[storeAs] = code;
        }

        return { code, remainingSeconds };
    }
};

// ============== EVALUATE JS ==============
const evaluate_js = {
    id: 'evaluate_js',
    name: 'Evaluate JavaScript',
    category: CATEGORIES.DEBUG,
    riskLevel: RISK_LEVELS.CRITICAL,
    capabilities: ['browser:js_eval'],

    inputs: {
        code: { type: 'string', required: true, description: 'JavaScript code to execute' },
        inPage: { type: 'boolean', default: true, description: 'Run in page context' },
        storeAs: { type: 'string' }
    },

    outputs: {
        result: { type: 'any' },
        error: { type: 'string' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { code, inPage, storeAs } = inputs;

        // Security: Only super_admin can use this
        if (context.caller?.role !== 'super_admin') {
            throw new Error('evaluate_js requires super_admin role');
        }

        try {
            let result;

            if (inPage) {
                result = await page.evaluate(code);
            } else {
                // Execute in Node context with sandboxed variables
                const fn = new Function('variables', 'context', `return (${code})`);
                result = fn(context.variables, { runId: context.runId });
            }

            if (storeAs) {
                context.variables[storeAs] = result;
            }

            return { result, error: null };
        } catch (error) {
            return { result: null, error: error.message };
        }
    }
};

// ============== SCREENSHOT ==============
const screenshot = {
    id: 'screenshot',
    name: 'Take Screenshot',
    category: CATEGORIES.DEBUG,
    riskLevel: RISK_LEVELS.MEDIUM,
    capabilities: ['browser:advanced'],

    inputs: {
        selector: { type: 'string', description: 'Element selector (full page if empty)' },
        path: { type: 'string', description: 'Save path (auto-gen if empty)' },
        format: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
        quality: { type: 'number', default: 80, description: 'JPEG quality (0-100)' },
        fullPage: { type: 'boolean', default: false }
    },

    outputs: {
        path: { type: 'string' },
        success: { type: 'boolean' }
    },

    impl: async (inputs, context) => {
        const { page } = context;
        const { selector, path: savePath, format, quality, fullPage } = inputs;
        const path = require('path');

        // Generate path if not provided
        const finalPath = savePath || path.join(
            context.screenshotsDir || './screenshots',
            `${context.runId}_${Date.now()}.${format}`
        );

        const options = {
            path: finalPath,
            type: format,
            fullPage
        };

        if (format === 'jpeg') {
            options.quality = quality;
        }

        if (selector) {
            const element = await page.$(selector);
            if (element) {
                await element.screenshot(options);
            } else {
                throw new Error(`Element not found: ${selector}`);
            }
        } else {
            await page.screenshot(options);
        }

        return { path: finalPath, success: true };
    }
};

// ============== SWITCH TAB ==============
const switch_tab = {
    id: 'switch_tab',
    name: 'Switch Tab',
    category: CATEGORIES.BROWSER,
    riskLevel: RISK_LEVELS.LOW,
    capabilities: ['browser:basic'],

    inputs: {
        index: { type: 'number', default: -1, description: 'Tab index (-1 = last)' },
        titleContains: { type: 'string', description: 'Match by title' },
        urlContains: { type: 'string', description: 'Match by URL' }
    },

    outputs: {
        switched: { type: 'boolean' },
        pageTitle: { type: 'string' }
    },

    impl: async (inputs, context) => {
        const { browser } = context;
        const { index, titleContains, urlContains } = inputs;

        const pages = await browser.pages();
        let targetPage = null;

        if (titleContains) {
            for (const p of pages) {
                const title = await p.title();
                if (title.includes(titleContains)) {
                    targetPage = p;
                    break;
                }
            }
        } else if (urlContains) {
            for (const p of pages) {
                if (p.url().includes(urlContains)) {
                    targetPage = p;
                    break;
                }
            }
        } else {
            const idx = index === -1 ? pages.length - 1 : index;
            targetPage = pages[idx];
        }

        if (!targetPage) {
            throw new Error('Target tab not found');
        }

        await targetPage.bringToFront();
        context.page = targetPage;

        return { switched: true, pageTitle: await targetPage.title() };
    }
};

// Export all special nodes
module.exports = {
    keyboard_action,
    log_debug,
    generate_2fa,
    evaluate_js,
    screenshot,
    switch_tab
};
