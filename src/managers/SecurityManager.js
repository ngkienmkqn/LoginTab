const path = require('path');
const { app } = require('electron');
const dns = require('dns').promises;
const filtrex = require('filtrex');

// Standardized Error Codes
const ERRORS = {
    ERR_ACCESS_DENIED: 'ERR_ACCESS_DENIED',
    ERR_EGRESS_DENYLIST: 'ERR_EGRESS_DENYLIST',
    ERR_EGRESS_DNS_PRIVATE_IP: 'ERR_EGRESS_DNS_PRIVATE_IP',
    ERR_EGRESS_REDIRECT_PRIVATE_IP: 'ERR_EGRESS_REDIRECT_PRIVATE_IP', // Redundant for static check but useful for future
    ERR_EGRESS_PROTOCOL: 'ERR_EGRESS_PROTOCOL',
    ERR_SANDBOX_TRAVERSAL: 'ERR_SANDBOX_TRAVERSAL',
    ERR_SANDBOX_OUTSIDE_ROOT: 'ERR_SANDBOX_OUTSIDE_ROOT',
    ERR_DB_EMPTY_WHERE: 'ERR_DB_EMPTY_WHERE',
    ERR_RETRY_BLOCKED_NON_IDEMPOTENT: 'ERR_RETRY_BLOCKED_NON_IDEMPOTENT',
    ERR_SENSITIVE_MAPPING_VIOLATION: 'ERR_SENSITIVE_MAPPING_VIOLATION',
    ERR_EVAL_UNSAFE: 'ERR_EVAL_UNSAFE'
};

// RBAC Capability Map (Legacy Role -> Capabilities)
const ROLE_CAPABILITIES = {
    'staff': ['browser:basic', 'logic:*', 'data:local'],
    'manager': ['browser:basic', 'browser:advanced', 'logic:*', 'data:local', 'network:internal', 'files:read'],
    'admin': ['browser:basic', 'browser:advanced', 'logic:*', 'data:*', 'network:internal', 'network:external', 'files:*', 'email:read', 'ai:generate', 'db:read', 'db:write'],
    'super_admin': ['*'] // All capabilities
};

// Network Fortress Configuration
const PRIVATE_IP_RANGES = [
    /^127\./,           // 127.0.0.0/8
    /^10\./,            // 10.0.0.0/8
    /^192\.168\./,      // 192.168.0.0/16
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^169\.254\./,      // Link-local
    /^fc00:/,           // IPv6 Unique Local
    /^fe80:/,           // IPv6 Link-local
    /^::1$/             // IPv6 Loopback
];

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'imaps:'];

class SecurityManager {
    constructor() {
        // Initialize Allowed Roots
        this.allowedRoots = [
            path.normalize(app.getPath('temp')),
            path.normalize(path.join(app.getPath('userData'), 'artifacts'))
        ];
    }

    /**
     * Check if a user role has the required capabilities
     * @param {string} role - User role (e.g. 'staff')
     * @param {string[]} requiredCaps - Array of capabilities required by the node
     * @returns {boolean}
     */
    checkCapability(role, requiredCaps) {
        if (!requiredCaps || requiredCaps.length === 0) return true;

        const userCaps = ROLE_CAPABILITIES[role] || [];
        if (userCaps.includes('*')) return true;

        for (const req of requiredCaps) {
            // Check exact match or wildcard match (e.g. 'logic:*' satisfies 'logic:if')
            // Simple logic: If existing cap ends with :*, it covers sub-scopes.
            const hasCap = userCaps.some(uCap => {
                if (uCap === req) return true;
                if (uCap.endsWith(':*')) {
                    const prefix = uCap.slice(0, -2); // 'logic'
                    return req.startsWith(prefix + ':');
                }
                return false;
            });

            if (!hasCap) {
                console.warn(`[Security] Access Denied. Role '${role}' missing capability '${req}'`);
                return false;
            }
        }
        return true;
    }

    /**
     * Validate expression using automation-safe grammar (filtrex)
     * @param {string} expression 
     * @param {object} context 
     * @returns {any} Result
     */
    evaluateExpression(expression, context) {
        try {
            // Define extra safe functions if needed
            const myFiltrex = filtrex.compileExpression(expression, {
                extraFunctions: {
                    contains: (str, pattern) => str && str.includes(pattern),
                    length: (arr) => arr ? arr.length : 0
                }
            });
            return myFiltrex(context);
        } catch (err) {
            throw new Error(`${ERRORS.ERR_EVAL_UNSAFE}: ${err.message}`);
        }
    }

    /**
     * Validate File Path Sandbox
     * @param {string} inputPath 
     * @returns {string} Resolved safe absolute path
     */
    validatePath(inputPath) {
        const normalized = path.normalize(inputPath);

        // 1. Check Traversal
        if (normalized.includes('..')) {
            throw new Error(ERRORS.ERR_SANDBOX_TRAVERSAL);
        }

        // 2. Resolve verify Root
        // We assume inputPath might be absolute or relative to some workspace. 
        // For simplicity in Phase 0, we check if it is *inside* an allowed root.
        // If it's just a filename, we default to Artifacts? 
        // Spec says: "Allowed Roots: %TEMP%, %APPDATA%/artifacts". 
        // A strict implementation requires the path to ALREADY be absolute and match, OR we prepend a root.
        // Let's allow absolute paths if they match roots.

        let targetPath = normalized;
        if (!path.isAbsolute(normalized)) {
            // Default to artifacts for relative paths
            targetPath = path.join(this.allowedRoots[1], normalized);
        }

        const isSafe = this.allowedRoots.some(root => targetPath.startsWith(root));
        if (!isSafe) {
            throw new Error(`${ERRORS.ERR_SANDBOX_OUTSIDE_ROOT}: Path must be in %TEMP% or %AppData%/artifacts`);
        }

        return targetPath;
    }

    /**
     * Network Fortress Egress Check
     * @param {string} targetUrl 
     */
    async checkNetworkEgress(targetUrl) {
        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch (e) {
            throw new Error('Invalid URL');
        }

        // 1. Protocol Check
        if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            throw new Error(`${ERRORS.ERR_EGRESS_PROTOCOL}: Protocol ${parsed.protocol} not allowed`);
        }

        let hostname = parsed.hostname;

        // Strip brackets for IPv6 literals (e.g. [::1] -> ::1)
        if (hostname.startsWith('[') && hostname.endsWith(']')) {
            hostname = hostname.slice(1, -1);
        }

        // 2. Literal IP Check
        // If hostname is an IP literal, enforce private range check
        if (this.isIpAddress(hostname)) {
            if (this.isPrivateIp(hostname)) {
                throw new Error(`${ERRORS.ERR_EGRESS_DENYLIST}: Direct IP access to private network denied`);
            }
            return; // Public IP allowed
        }

        // 3. DNS Resolution Check
        try {
            // Note: dns.lookup might not handle brackets well depending on node version, so using stripped hostname is safer
            const { address } = await dns.lookup(hostname);
            if (this.isPrivateIp(address)) {
                const e = new Error(`${ERRORS.ERR_EGRESS_DNS_PRIVATE_IP}: Domain resolved to private IP ${address}`);
                e.code = ERRORS.ERR_EGRESS_DNS_PRIVATE_IP;
                throw e;
            }
        } catch (err) {
            // Re-throw security errors, ignore DNS resolution failures (safe to fail closed? No, standard fetch fails if DNS fails)
            // But here we just want to Validate. If DNS fails, we can't check IP.
            // Strict mode: If DNS fails, we block? Or we let the node fail naturally?
            // If we assume "if we can't check, we block", then throw.
            // But typical DNS flakes happen. Let's rethrow security errors only.
            if (err.code === ERRORS.ERR_EGRESS_DNS_PRIVATE_IP) throw err;
        }
    }

    isIpAddress(host) {
        // Simple regex or net.isIP
        return require('net').isIP(host) !== 0;
    }

    isPrivateIp(ip) {
        // IPv6 Check
        if (ip === '::1') return true;
        if (ip.startsWith('fc00:')) return true; // Unique Local
        if (ip.startsWith('fe80:')) return true; // Link Local

        // IPv4 Check
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4) return false; // Should be caught by isIP

        // 127.0.0.0/8
        if (parts[0] === 127) return true;
        // 10.0.0.0/8
        if (parts[0] === 10) return true;
        // 192.168.0.0/16
        if (parts[0] === 192 && parts[1] === 168) return true;
        // 172.16.0.0/12 (172.16 - 172.31)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        // 169.254.0.0/16
        if (parts[0] === 169 && parts[1] === 254) return true;

        return false;
    }

    /**
     * Strict Output Mapping Check
     * @param {object} nodeSchema 
     * @param {string} outputKey 
     * @param {string} method ('saveAs' or 'mapping')
     */
    validateSensitiveMapping(nodeSchema, outputKey, method) {
        // If node schema marks input/output as sensitive, we must restrict.
        // Spec 1.2.2: "Outputs marked as sensitive ... Must NOT be mapped to variables.*"

        // We need to look up the output definition in the schema
        const outputDef = nodeSchema.outputs && nodeSchema.outputs[outputKey];
        if (outputDef && outputDef.sensitive) {
            throw new Error(`${ERRORS.ERR_SENSITIVE_MAPPING_VIOLATION}: Cannot map sensitive output '${outputKey}' to variables via ${method}`);
        }
    }
}

module.exports = { SecurityManager, ERRORS };
