const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs-extra');
const zlib = require('zlib');
const { app } = require('electron');
const { getPool } = require('../database/mysql');

class SyncManager {
    constructor() {
        // Local temporary zip path
        this.tempDir = path.join(app.getPath('userData'), 'temp_sync');
        fs.ensureDirSync(this.tempDir);
    }

    // Pack session folder -> zip record in MySQL (with GZIP compression)
    async uploadSession(accountId) {
        let tempCopyPath = null;
        try {
            const sessionPath = path.join(app.getPath('userData'), 'sessions', accountId);
            if (!fs.existsSync(sessionPath)) {
                console.log(`[Sync] No local session found for ${accountId}, skipping upload.`);
                return;
            }

            // Small delay to allow Chrome to release files
            await new Promise(r => setTimeout(r, 500));

            console.log(`[Sync] Preparing session for upload: ${accountId}...`);
            tempCopyPath = path.join(this.tempDir, `copy_${accountId}_${Date.now()}`);
            await fs.ensureDir(tempCopyPath);

            // AGGRESSIVE FILTER: Only keep fingerprint-critical data
            // KEEP: Cookies, Local Storage, IndexedDB, Preferences, Login Data
            // EXCLUDE: All caches, temp data, logs (will regenerate)
            await fs.copy(sessionPath, tempCopyPath, {
                filter: (src) => {
                    const base = path.basename(src).toLowerCase();
                    const relativePath = path.relative(sessionPath, src).toLowerCase();

                    // Skip temp files and locks
                    if (base.endsWith('.tmp') || base.endsWith('.log') ||
                        base.includes('singleton') || base.includes('lock')) {
                        return false;
                    }

                    // EXPANDED EXCLUDE LIST - Safe to remove (will regenerate)
                    const excludeDirs = [
                        // Cache directories (large, not needed for session)
                        'cache', 'code cache', 'gpucache', 'shader cache', 'grcache',
                        'component_crx_cache', 'jumplisticoncache', 'module_info cache',

                        // Service worker & storage (large, regenerates)
                        'service worker', 'blob_storage', 'file system',

                        // Logs & crash data
                        'crashpad', 'crash reports', 'webrtc_event_logs', 'optimization_guide',

                        // Platform-specific (not needed)
                        'platform_notifications', 'safe browsing', 'download_service',
                        'feature_engagement_tracker', 'site characteristics database',

                        // Extension caches (regenerates)
                        'extension rules', 'extension state', 'extension scripts cache',
                        'managed_extension_policies',

                        // Media cache
                        'media cache', 'pepper data', 'pnacl translation cache',

                        // Misc (not fingerprint critical)
                        'storage', 'top sites', 'visited links', 'web data',
                        'network action predictor', 'network', 'reporting and nel'
                    ];

                    for (const dir of excludeDirs) {
                        if (relativePath.startsWith(dir + path.sep) || relativePath === dir) {
                            return false;
                        }
                    }

                    return true;
                }
            });

            // YIELD: Let event loop process other events after heavy copy
            await new Promise(r => setImmediate(r));

            const zip = new AdmZip();
            zip.addLocalFolder(tempCopyPath);

            // YIELD: Let event loop process after zip creation
            await new Promise(r => setImmediate(r));

            const zipBuffer = zip.toBuffer();
            console.log(`[Sync] ZIP size before GZIP: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

            // GZIP COMPRESSION (Level 9 = max compression)
            const gzippedBuffer = await new Promise((resolve, reject) => {
                zlib.gzip(zipBuffer, { level: 9 }, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            console.log(`[Sync] After GZIP: ${(gzippedBuffer.length / 1024 / 1024).toFixed(2)} MB (${Math.round((1 - gzippedBuffer.length / zipBuffer.length) * 100)}% reduction)`);

            // YIELD: Before heavy network I/O
            await new Promise(r => setImmediate(r));

            const pool = await getPool();
            await pool.query(
                'INSERT INTO session_backups (account_id, zip_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE zip_data = VALUES(zip_data)',
                [accountId, gzippedBuffer]
            );

            console.log(`[Sync] Session uploaded successfully for ${accountId}`);
        } catch (error) {
            console.error(`[Sync] Upload failed for ${accountId}:`, error);
        } finally {
            if (tempCopyPath && fs.existsSync(tempCopyPath)) {
                await fs.remove(tempCopyPath).catch(() => { });
            }
        }
    }

    // Download zip record -> session folder (with GZIP decompression)
    async downloadSession(accountId) {
        console.log(`[Sync] DEBUG: Starting downloadSession for ${accountId}`);
        try {
            const pool = await getPool();
            console.log(`[Sync] DEBUG: Pool acquired, executing query...`);
            const [rows] = await pool.query('SELECT zip_data FROM session_backups WHERE account_id = ?', [accountId]);
            console.log(`[Sync] DEBUG: Query returned ${rows.length} rows`);

            if (rows.length === 0) {
                console.log(`[Sync] No remote session found for ${accountId}.`);
                return false;
            }

            console.log(`[Sync] Downloading session for ${accountId}...`);
            let zipBuffer = rows[0].zip_data;

            // Check if data is GZIP compressed (magic bytes: 0x1f 0x8b)
            if (zipBuffer[0] === 0x1f && zipBuffer[1] === 0x8b) {
                console.log(`[Sync] Decompressing GZIP data...`);
                zipBuffer = await new Promise((resolve, reject) => {
                    zlib.gunzip(zipBuffer, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
                console.log(`[Sync] Decompressed to ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            }

            const sessionPath = path.join(app.getPath('userData'), 'sessions', accountId);

            // Clean existing local session to avoid conflicts
            await fs.emptyDir(sessionPath);

            const zip = new AdmZip(zipBuffer);
            zip.extractAllTo(sessionPath, true);

            console.log(`[Sync] Session restored to ${sessionPath}`);
            return true;
        } catch (error) {
            console.error(`[Sync] Download failed for ${accountId}:`, error);
            return false;
        }
    }


    // Upload all storage data (cookies + localStorage + sessionStorage) to MySQL
    async uploadStorage(accountId, storageData) {
        try {
            const pool = await getPool();
            const { cookies = [], localStorage = {}, sessionStorage = {} } = storageData;

            await pool.query(
                `INSERT INTO account_cookies 
                 (account_id, cookies, local_storage, session_storage) 
                 VALUES (?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE 
                 cookies = VALUES(cookies),
                 local_storage = VALUES(local_storage),
                 session_storage = VALUES(session_storage)`,
                [
                    accountId,
                    JSON.stringify(cookies),
                    JSON.stringify(localStorage),
                    JSON.stringify(sessionStorage)
                ]
            );

            console.log(`[Sync] Storage uploaded for ${accountId} (${cookies.length} cookies, ${Object.keys(localStorage).length} localStorage, ${Object.keys(sessionStorage).length} sessionStorage)`);
        } catch (error) {
            console.error(`[Sync] Failed to upload storage for ${accountId}:`, error);
        }
    }

    // Download all storage data from MySQL
    async downloadStorage(accountId) {
        try {
            const pool = await getPool();
            const [rows] = await pool.query(
                'SELECT cookies, local_storage, session_storage FROM account_cookies WHERE account_id = ?',
                [accountId]
            );

            if (rows.length > 0) {
                const result = {
                    cookies: rows[0].cookies ? JSON.parse(rows[0].cookies) : [],
                    localStorage: rows[0].local_storage ? JSON.parse(rows[0].local_storage) : {},
                    sessionStorage: rows[0].session_storage ? JSON.parse(rows[0].session_storage) : {}
                };

                console.log(`[Sync] Storage downloaded for ${accountId} (${result.cookies.length} cookies, ${Object.keys(result.localStorage).length} localStorage, ${Object.keys(result.sessionStorage).length} sessionStorage)`);
                return result;
            }
            return null;
        } catch (error) {
            console.error(`[Sync] Failed to download storage for ${accountId}:`, error);
            return null;
        }
    }

    // Legacy method for backward compatibility (wraps uploadStorage)
    async uploadCookies(accountId, cookies) {
        await this.uploadStorage(accountId, { cookies });
    }

    // Legacy method for backward compatibility (wraps downloadStorage)
    async downloadCookies(accountId) {
        const storage = await this.downloadStorage(accountId);
        return storage ? storage.cookies : null;
    }
}

module.exports = new SyncManager();
