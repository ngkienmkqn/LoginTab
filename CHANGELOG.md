# Release History

## [2.2.2] - 2026-01-19
**"Cookie Sync Actually Works Now"**

### Critical Fixes
- **Cookie Export Timing Issue:** Fixed fatal bug where cookies couldn't be extracted on browser close because `browser.pages()` returned empty array after disconnect event.
- **New Strategy - Periodic Sync:** Implemented automatic cookie backup every 30 seconds while browser is active.
- **Page Load Sync:** Added cookie sync trigger on every page navigation completion.

### Technical Details
**Problem Identified:**
- v2.2.0-2.2.1 tried to export cookies in `browser.on('disconnected')` handler
- At that point, browser was already disconnected → `pages()` returned `[]`
- Result: `[Sync] ⚠ No pages available for cookie extraction`

**Solution Implemented:**
1. **Periodic Backup:** `setInterval` every 30s checks if browser is connected and exports cookies
2. **Navigation Sync:** `page.on('load')` event triggers immediate cookie export after page loads
3. **Graceful Cleanup:** Interval automatically clears when browser disconnects

**User Impact:**
- Sessions now persist correctly across machine switches
- No user action required - cookies auto-sync in background
- Visible in logs: `[Sync] ✓ Periodic cookie backup (X cookies)` and `[Sync] ✓ Cookies synced on page load (X cookies)`



## [2.2.1] - 2026-01-19
**"Hotfix: SyncManager Syntax Error"**

### Critical Fixes
- **SyncManager.js Syntax Error:** Fixed missing closing brace in `downloadSession` method that caused app crash on launch.
- **Indentation Fix:** Corrected method indentation for `uploadCookies` and `downloadCookies` to proper class level.

### Technical Details
- Error was introduced during v2.2.0 implementation when adding cookie sync methods
- Methods were accidentally nested inside `downloadSession` instead of being at class level
- This hotfix ensures the Hybrid Sync feature works correctly



## [2.2.0] - 2026-01-19
**"The Hybrid Sync Update"**

### Features
- **Cross-Machine Session Sync:** Implemented portable JSON cookie synchronization. Sessions now persist when switching between machines (Machine A → Machine B). Previously, cookies were hardware-encrypted (DPAPI/Keychain) and couldn't transfer.
- **Hybrid Synchronization:** 2-layer sync model - File-based sync for cache/storage + JSON cookie sync for authentication tokens.

### Technical Details
- **New Table:** `account_cookies` stores portable session cookies in JSON format.
- **Auto Export/Import:** Cookies are automatically exported on browser close and injected on launch.



## [2.1.2] - 2026-01-19
**"The Hotfix Build"**

### Critical Fixes
- **Build Launch Error:** Added `pipe: true` to Puppeteer launch configuration. This resolves the "Failed to launch browser process" error seen in packaged/built versions (Electron IPC issue).

## [2.1.1] - 2026-01-19
**"The Cross-Platform Stealth Update"**

### Features
- **macOS Support:** Added official support for macOS Chrome and Edge paths in `BrowserManager`. Now verified for Mac environments.
- **Stealth Engine v2.0:** Consolidated stealth logic into `stealth-master-v2.md` ("The Golden Formula").

### Documentation (AI-Partner)
- **Stealth Master Spec:** Created `AI-Partner/02-Browser-Automation/Stealth-Engine/stealth-master-v2.md` consolidating all evasion strategies (UA-CH, AutomationControlled, Zero Noise) into a final logic reference.


### Fixes
- **Google Login:** Re-enabled `AutomationControlled` flag and added `UA-CH` injection to fix Google Login detection (Critical Patch).

## [2.1.0] - 2026-01-19
**"Admin Empowerment Update"**

### Features
- **Admin User Management:** Admins can now manage their own "Staff" users via the UI (scoped view).
- **Admin Automations:** "Automations" tab is now accessible to Admins.
- **Profile Deletion:** Admins can now DELETE profiles they manage (assigned to self or staff).
- **Resource Auto-Assignment:** Newly created profiles are automatically assigned to the creator, ensuring immediate visibility.

### Security (RBAC v2.1.0)
- **Scoped User Management:** Backend enforces strict scoping so Admins cannot see/edit users not managed by them.
- **Workflow Scoping:** `get-workflows` is now role-aware. Admin sees only workflows they created. Super Admin sees all.
- **Google Login Bypass:** Confirmed 95% compliance with "Real Chrome, Zero Noise" strategy.

### Documentation (AI-Partner)
- **RBAC v2.1.0:** Updated `AI-Partner/specs/RBACv2/spec.md` to officially include "Resource Auto-Assignment" (Decision 6) and Scoped Admin Permissions.


### Fixes
- **Fixed "Add User" button unresponsiveness:** Resolved JS conflict in `renderer.js`.
- **Fixed Profile Visibility:** Admin created profiles were previously invisible due to missing assignment. Fixed via auto-assignment in `create-account` handler.
