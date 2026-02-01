/**
 * Authentication Middleware
 * Extracted from server.js for modularity
 */

/**
 * Require authentication middleware
 * Checks if user is logged in via global session
 */
function requireAuth(req, res, next) {
    if (!global.currentAuthUser) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    req.user = global.currentAuthUser;
    next();
}

module.exports = { requireAuth };
