# Release History

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
