const { ipcMain } = require('electron');
const HumanBehavior = require('../utils/HumanBehavior');

class AutomationManager {
    constructor(browserManager) {
        this.browserManager = browserManager;
    }

    // Execute a workflow JSON on a given page
    async runWorkflow(workflowData, page, profile = null) {
        console.log('[Automation] Starting workflow execution...');
        this.currentProfile = profile; // Store for variable resolution

        if (!workflowData || !workflowData.drawflow || !workflowData.drawflow.Home) {
            console.error('[Automation] Invalid workflow data');
            return;
        }

        const nodes = workflowData.drawflow.Home.data;

        // Find Start Node
        let startNodeId = null;
        for (const [id, node] of Object.entries(nodes)) {
            if (node.name === 'start') {
                startNodeId = id;
                break;
            }
        }

        if (!startNodeId) {
            console.error('[Automation] No Start node found!');
            return;
        }

        console.log('[Automation] Found Start Node:', startNodeId);
        await this.executeNode(startNodeId, nodes, page);
        console.log('[Automation] Workflow execution finished.');
    }

    async executeNode(nodeId, allNodes, page) {
        const node = allNodes[nodeId];
        if (!node) {
            console.warn(`[Automation] Node ${nodeId} not found, skipping`);
            return;
        }

        console.log(`[Automation] ▶ Executing Node [${node.name}] (ID: ${nodeId})`);
        console.log(`[Automation]   Data:`, JSON.stringify(node.data, null, 2));

        try {
            await this.performAction(node, page);
            console.log(`[Automation] ✓ Node [${node.name}] completed successfully`);
        } catch (err) {
            console.error(`[Automation] ✗ ERROR in node ${nodeId} [${node.name}]:`, err);
            console.error(`[Automation]   Error details:`, {
                message: err.message,
                stack: err.stack,
                nodeData: node.data
            });
            return; // Stop execution on error
        }

        // Find next node(s)
        // Drawflow structure: outputs -> output_1 -> connections -> [ { node: "2", output: "input_1" } ]
        // We assume single output flow for simplicity for now, or parallel execution
        const outputs = node.outputs;
        if (outputs && outputs.output_1 && outputs.output_1.connections) {
            for (const conn of outputs.output_1.connections) {
                const nextNodeId = conn.node;
                // Recursive step
                await this.executeNode(nextNodeId, allNodes, page);
            }
        }
    }

    async performAction(node, page) {
        const data = node.data;

        switch (node.name) {
            case 'start':
                // Do nothing, just trigger
                break;

            case 'wait':
                if (data.mode === 'selector') {
                    const selector = data.selector;
                    const timeout = parseInt(data.timeout) || 30000;
                    console.log(`[Automation] ⏳ Waiting for selector: "${selector}" (timeout: ${timeout}ms)`);
                    await page.waitForSelector(selector, { timeout });
                    console.log(`[Automation] ✓ Selector found: "${selector}"`);
                } else {
                    const ms = parseInt(data.ms) || 1000;
                    console.log(`[Automation] ⏳ Waiting ${ms}ms...`);
                    await new Promise(r => setTimeout(r, ms));
                }
                break;

            case 'click':
                if (data.selector) {
                    console.log(`[Automation] 🖱 Clicking (Human): "${data.selector}"`);
                    await page.waitForSelector(data.selector, { timeout: 10000 });
                    await HumanBehavior.humanClick(page, data.selector);
                    console.log(`[Automation] ✓ Clicked: "${data.selector}"`);
                }
                break;

            case 'type':
                // Selector is now optional - will type into focused element if not provided

                let textToType = data.text || '';

                // Resolve dynamic variables if textType is set
                if (data.textType && data.textType !== 'static') {
                    const profile = this.currentProfile;

                    console.log(`[Automation] 🔄 Resolving variable: {{${data.textType}}}`);

                    switch (data.textType) {
                        case 'username':
                            textToType = profile?.name || profile?.email || '';
                            console.log(`[Automation]   → Username: ${textToType}`);
                            break;
                        case 'password':
                            textToType = profile?.auth?.password || '';
                            console.log(`[Automation]   → Password: ${'*'.repeat(textToType.length)}`);
                            break;
                        case '2fa':
                            if (profile?.auth?.twoFactorSecret) {
                                const { TOTP } = require('otplib');
                                const crypto = require('crypto');
                                const authenticator = new TOTP({
                                    createDigest: (algorithm, content) => crypto.createHash(algorithm).update(content).digest(),
                                    createRandomBytes: (size) => crypto.randomBytes(size)
                                });
                                textToType = authenticator.generate(profile.auth.twoFactorSecret);
                                console.log(`[Automation]   → 2FA Code: ${textToType}`);
                            }
                            break;
                    }
                }

                // If selector is provided, type into that element
                if (data.selector && data.selector.trim()) {
                    console.log(`[Automation] ⌨ Typing (Human) into: "${data.selector}"`);
                    console.log(`[Automation]   Text length: ${textToType.length} characters`);

                    // Retry for detached frame
                    let retries = 3;
                    while (retries > 0) {
                        try {
                            await page.waitForSelector(data.selector, { timeout: 10000 });
                            await HumanBehavior.humanType(page, data.selector, textToType);
                            break;
                        } catch (err) {
                            retries--;
                            console.warn(`[Automation] ⚠ Typing retry ${3 - retries}/3 failed: ${err.message}`);
                            await new Promise(r => setTimeout(r, 1000));
                            if (retries === 0) throw err;
                        }
                    }
                    console.log(`[Automation] ✓ Typed into: "${data.selector}"`);

                } else {
                    console.log(`[Automation] ⌨ Typing into focused element (Human - No Selector)`);
                    console.log(`[Automation]   Text length: ${textToType.length} characters`);

                    // Human-like typing for focused element without selector
                    for (const char of textToType) {
                        const delay = Math.floor(Math.random() * (150 - 50 + 1)) + 50; // Random 50-150ms
                        await page.keyboard.type(char, { delay });

                        // Occasional pause
                        if (Math.random() < 0.1) {
                            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 300) + 200));
                        }
                    }
                    console.log(`[Automation] ✓ Typed into focused element`);
                }
                break;

            case '2fa':
                // This is complex. We need the 2FA secret from the CURRENT profile.
                // We'll assume the browserManager has access or we pass the secret in context.
                // For now, simple logging or placeholder.
                // Real implementation requires accessing the profile's secret.
                console.log('[Automation] 🔐 2FA Node (Pending Integration)');
                break;

            case 'keyboard':
                if (data.key) {
                    console.log(`[Automation] ⌨ Pressing key: "${data.key}"`);
                    await page.keyboard.press(data.key);
                    console.log(`[Automation] ✓ Key pressed: "${data.key}"`);
                } else {
                    console.warn('[Automation] ⚠ Keyboard node missing key!');
                }
                break;

            case 'find':
                if (data.selector) {
                    console.log(`[Automation] Finding/Waiting for ${data.selector}`);
                    // Default timeout 30s
                    await page.waitForSelector(data.selector, { timeout: 30000 });
                }
                break;

            default:
                console.warn('[Automation] Unknown node type:', node.name);
        }
    }
}

module.exports = AutomationManager;
