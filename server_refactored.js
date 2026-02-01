/**
 * Login Tab - Express.js Server (Refactored)
 * Uses modular routes from src/server/
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Database & Managers
const { initDB, getPool, getDatabaseStats, resetDatabase } = require('./src/database/mysql');
const BrowserManager = require('./src/managers/BrowserManager');
const AutomationManager = require('./src/managers/AutomationManager');

// Modular Routes
const { registerAllRoutes } = require('./src/server/routes');

// ==================== Constants ====================
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(os.homedir(), '.login-tab');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// ==================== Session Management ====================
global.currentAuthUser = null; // { id, username, role }

// ==================== Express Setup ====================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/ui')));

// Health check (standalone - not in routes)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: require('./package.json').version });
});

// ==================== Socket.IO Events ====================
io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('[Socket] Client disconnected:', socket.id);
    });
});

// Fallback: Serve index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/ui/index.html'));
});

// ==================== Initialize ====================
async function start() {
    try {
        console.log('[Server] Initializing...');
        console.log('[Server] Data directory:', DATA_DIR);

        // Initialize database
        await fs.ensureDir(SESSIONS_DIR);
        await initDB();

        // Initialize automation manager
        const automationManager = new AutomationManager(BrowserManager);

        // Register all modular routes
        registerAllRoutes(app, {
            dbFunctions: { getDatabaseStats, resetDatabase, initDB },
            automationManager
        });

        // Start server
        server.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════╗
║                    LOGIN TAB v${require('./package.json').version}                  ║
║                   Express.js Server                   ║
╠═══════════════════════════════════════════════════════╣
║  Open in browser: http://localhost:${PORT}              ║
╚═══════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('[Server] Failed to start:', error);
        process.exit(1);
    }
}

start();
