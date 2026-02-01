# Technology Stack & Dependencies

## 1. Core Runtime
- **Runtime**: Node.js (v18+ recommended via Electron).
- **Framework**: Electron (v33+).
- **Language**: JavaScript (ES6+ CommonJS).

## 2. Critical Dependencies

### Browser Automation
| Package | Purpose | AI Context |
| :--- | :--- | :--- |
| `puppeteer-core` | Browser Control | Uses local Chrome executable. Does not download Chromium. |
| `puppeteer-extra` | Framework | Wrapper for plugins. |
| `puppeteer-extra-plugin-stealth` | Evasion | Base layer for bot detection bypass. |
| `proxy-chain` | Networking | Handles authenticated proxies for Puppeteer. |

### Data & State
| Package | Purpose | AI Context |
| :--- | :--- | :--- |
| `mysql2` | Database | Promise-based MySQL driver. Connection pooling enabled. |
| `lowdb` | Local Config | JSON-based local settings (app preference). |
| `fs-extra` | Filesystem | Robust file ops (ensureDir, remove, copy). |
| `adm-zip` | Compression | Zipping session folders for DB storage. |

### Security & Crypto
| Package | Purpose | AI Context |
| :--- | :--- | :--- |
| `otplib` | 2FA | Generating TOTP codes locally. |
| `hi-base32` | Encoding | Base32 decoding for OTP secrets. |
| `uuid` | Identity | Unique ID generation for all entities. |

### UI & Visualization
| Package | Purpose | AI Context |
| :--- | :--- | :--- |
| `drawflow` | Editor | Visual node-based workflow editor (Frontend lib). |
| `@fortawesome/fontawesome-free` | Icons | UI Icons (via CDN/Local). |

## 3. Development Tools
- **Build System**: `electron-builder` (Multi-platform target support).
- **CI/CD**: GitHub Actions (defined in `.github/workflows`).
- **Git**: Version control.

## 4. Design Decisions
- **Why CommonJS?**: Native compatibility with Electron's `nodeIntegration`.
- **Why MySQL?**: Relational constraints (Users <-> Accounts) + Remote capability.
- **Why Puppeteer Core?**: Allows utilizing the user's installed Google Chrome for higher trust score (Identity Consistency) vs bundled Chromium.
