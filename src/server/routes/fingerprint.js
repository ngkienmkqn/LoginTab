/**
 * Fingerprint Routes
 * Extracted from server.js for modularity
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const FingerprintGenerator = require('../../utils/FingerprintGenerator');

const router = express.Router();

// Preview fingerprint
router.post('/preview', requireAuth, async (req, res) => {
    const { currentId, os } = req.body;
    try {
        const id = currentId || 'PREVIEW_' + Date.now();
        const fp = FingerprintGenerator.generateFingerprint(id, os || 'win');
        res.json({ success: true, fingerprint: fp });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

module.exports = router;
