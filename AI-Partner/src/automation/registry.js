/**
 * Node Registry - Central node definition registry
 * Based on workflow_spec_v2.md
 */

// Node Categories
const CATEGORIES = {
    BROWSER: 'Browser',
    LOGIC: 'Logic',
    DATA: 'Data',
    NETWORK: 'Network',
    ACTION: 'Action',
    DEBUG: 'Debug'
};

// Risk Levels
const RISK_LEVELS = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical'
};

// Capability → Role mapping
const CAPABILITY_ROLES = {
    'logic:*': ['staff', 'admin', 'super_admin'],
    'browser:basic': ['staff', 'admin', 'super_admin'],
    'browser:advanced': ['admin', 'super_admin'],
    'browser:js_eval': ['super_admin'],
    'data:read': ['staff', 'admin', 'super_admin'],
    'data:write': ['admin', 'super_admin'],
    'db:read': ['staff', 'admin', 'super_admin'],
    'db:write': ['admin', 'super_admin'],
    'db:delete': ['super_admin'],
    'network:internal': ['staff', 'admin', 'super_admin'],
    'network:external': ['admin', 'super_admin'],
    'system:shell': ['super_admin']
};

// Risk-based audit requirements
const RISK_AUDIT = {
    'Low': { audit: false, confirmation: false },
    'Medium': { audit: true, confirmation: false },
    'High': { audit: true, confirmation: true },
    'Critical': { audit: true, confirmation: true, adminOnly: true }
};

/**
 * Check if user has capability
 */
function hasCapability(userRole, capability) {
    // Check wildcards first
    const category = capability.split(':')[0];
    const wildcard = `${category}:*`;

    if (CAPABILITY_ROLES[wildcard]?.includes(userRole)) {
        return true;
    }

    return CAPABILITY_ROLES[capability]?.includes(userRole) || false;
}

/**
 * Validate node execution by role
 */
function canExecuteNode(userRole, node) {
    const capabilities = node.capabilities || [];
    return capabilities.every(cap => hasCapability(userRole, cap));
}

// Export
module.exports = {
    CATEGORIES,
    RISK_LEVELS,
    CAPABILITY_ROLES,
    RISK_AUDIT,
    hasCapability,
    canExecuteNode
};
