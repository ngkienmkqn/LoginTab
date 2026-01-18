# Troubleshooting & Maintenance Guide

## 1. Common Runtime Errors

### A. "Keyboard node missing key"
- **Context**: Occurs during Workflow Execution.
- **Cause**: The `type` node in `drawflow` might have saved with an empty `text` property, or the key mapping in `AutomationManager` is undefined.
- **Fix**: Open the Workflow Editor, select the 'Type' node, and ensure a valid string is entered.

### B. `mf.dll` Missing (Windows N Editions)
- **Context**: App crashes on startup or white screen.
- **Cause**: Electron depends on Media Foundation (MF), which is stripped in Windows N versions.
- **Fix**: Install the "Media Feature Pack" for the specific Windows version.

### C. `ECONNREFUSED` (Database)
- **Context**: Cannot login or load accounts.
- **Cause**: MySQL service is down or incorrect `DB_HOST` in `db.json`.
- **Fix**:
  1. Check `services.msc` -> `MySQL80` (Running?).
  2. Verify `src/database/db.json` credentials.

### D. "Chrome not found"
- **Context**: Browser launch failure.
- **Cause**: User has a non-standard Chrome installation path.
- **Fix**: Add the custom path to the `possiblePaths` array in `BrowserManager.js` or set `CHROME_PATH` env var.

## 2. Debugging Procedures

### Logging System
The app uses `winston` for logging.
- **Location**: `%APPDATA%/LoginTab/logs/` (or `logs/` in dev).
- **Files**:
  - `error.log`: Stack traces of crashes.
  - `combined.log`: General operational logs (Auth, Launch events).

### Maintenance Scripts
We have several standalone scripts in the root for emergency maintenance:
- `reset-fingerprints.js`: batch updates all account fingerprints to the latest version.
- `check-db-size.js`: Analyzes the size of `session_backups` table.
- `verify_reset.js`: Tests the database reset functionality.

## 3. Database Maintenance
The `session_backups` table can grow huge (BLOBs).
- **Pruning**: Currently, the system does NOT auto-prune.
- **Manual**: Run `DELETE FROM session_backups WHERE last_updated < DATE_SUB(NOW(), INTERVAL 30 DAY);` to clear old cache.

## 4. Mac Specific Issues
- **"App is damaged and can't be opened"**:
  - **Cause**: Lack of Apple Notarization (we assume ad-hoc).
  - **Fix**: User must run `xattr -cr /Applications/Login\ Tab.app` to remove the quarantine flag.
