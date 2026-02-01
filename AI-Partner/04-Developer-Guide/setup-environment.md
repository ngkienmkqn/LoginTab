# Developer Setup Guide

## 1. Prerequisites
- **Node.js**: v18.14.0 or higher (LTS recommended).
- **MySQL**: v8.0+ (Community Edition).
- **Git**: For version control.
- **Build Tools**:
  - **Windows**: `visualcpp-build-tools` (Run `npm install --global --production windows-build-tools` if needed).
  - **Mac**: Xcode Command Line Tools.

## 2. Installation Steps

### Step 1: Clone & Install
```bash
git clone https://github.com/ngkienmkqn/LoginTab.git
cd LoginTab
npm install
# Note: This executes post-install scripts for electron-builder
```

### Step 2: Database Configuration
Create a `src/database/db.json` file (if not exists, the app creates a default one, but you should configure it):
```json
{
  "host": "127.0.0.1",
  "user": "root",
  "password": "your_password",
  "database": "spectre_db"
}
```

### Step 3: Database Initialization
You do NOT need to run SQL scripts manually.
1. Start the app: `npm start`.
2. `src/database/mysql.js` checks for tables.
3. If missing, it executes the `CREATE TABLE` logic automatically.
4. It also ensures the **Super Admin** exists (`admin` / `Kien123!!`).

## 3. Running the App
- **Development**:
  ```bash
  npm start
  ```
  - Use `Ctrl+Shift+I` to open DevTools (if enabled for your role).
  - Hot-reload is NOT enabled by default (requires restart).

- **Production Build**:
  ```bash
  npm run build
  ```
  - Output: `dist/` folder.
  - Generates `.exe` (Windows) or `.dmg` (Mac).

## 4. Code Standards
- **Indent**: 4 Spaces.
- **Quotes**: Single quotes preferred via Prettier.
- **Async/Await**: Preferred over Promises/Callbacks.
- **Comments**: JSDoc style for functions.

## 5. Adding New Dependencies
Always use `npm install <package> --save`.
**Warning**: Native modules (like `sqlite3` or low-level system libs) often break cross-platform builds. Check `electron-builder` compatibility before adding native dependencies.
