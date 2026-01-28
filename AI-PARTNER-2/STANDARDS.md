# AI-PARTNER-2: Coding Standards & Best Practices

## 1. Core Philosophy
**"Split it up. Keep it clean."**
The era of monolithic `index.html` and `renderer.js` is over. Every feature must be isolated, modular, and documented.

---

## 2. File Structure Standards

### 2.1 UI Directory (`src/ui`)
Do not dump everything into the root of `src/ui`.
```
src/ui/
├── css/                  # STYLES ONLY
│   ├── main.css          # Reset, Variables, Layout
│   ├── components.css    # Buttons, Inputs, Cards
│   ├── themes.css        # Dark/Light mode variables
│   └── modules/          # Feature-specific CSS (e.g., automation-editor.css)
├── js/                   # LOGIC ONLY
│   ├── app.js            # Main entry point (Initialization)
│   ├── modules/          # Feature Modules
│   │   ├── auth.js       # Login/Logout
│   │   ├── navigation.js # Tab switching
│   │   ├── profiles.js   # Profile Management
│   │   ├── proxies.js    # Proxy Management
│   │   └── ...
│   └── utils/            # Shared Helpers
│       ├── dom.js        # DOM manipulation helpers
│       └── ipc.js        # IPC wrappers
├── assets/               # IMAGES, FONTS
└── index.html            # MAIN SHELL (Skeleton only)
```

### 2.2 Documentation (`AI-PARTNER-2`)
Every major change must be reflected here.
- **README.md**: The map.
- **ARCHITECTURE.md**: The system design.
- **STANDARDS.md**: This file.

---

## 3. Coding Conventions

### 3.1 HTML
- **No Inline CSS**: Never use `<div style="...">`. Use classes.
- **No Inline JS**: Never use `onclick="..."`. Attach event listeners in JS modules.
- **Semantic IDs**: Use `prefix-feature-element` (e.g., `btn-profile-add`, `input-login-username`).

### 3.2 JavaScript
- **Modules**: Use ES6 Modules (`import`/`export`) or minimal Namespace pattern if Node integration prevents strict ES6.
- **Functions**: Single Responsibility Principle. A function should do one thing.
- **Comments**:
  - **Top of file**: What does this module do?
  - **Above complex logic**: *Why* are we doing this? (Not just *what*).
  - **JSDoc**: For public functions.

### 3.3 CSS
- **Variables**: Use `--variable-name` for colors, spacing.
- **BEM-ish**: `block__element--modifier` is preferred for clarity, but standard kebab-case is acceptable if consistent.

### 3.4 Versioning & Documentation Rules (IMPORTANT)
- **Window Title**: The application window must always display the current version number (e.g., `Login Tab v2.5.2`).
- **Vault Updates**: Every time **Logic Code** (Backend/Managers/Modules) is modified, you MUST update the corresponding documentation in `AI-PARTNER-2/06-Vault`.
  - Provide a summary of logic changes.
  - Ensure paths are accurate.

### 3.5 Detailed Naming Conventions
- **Variables**: `camelCase` (e.g., `currentUser`, `isActive`).
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `API_URL`).
- **Classes**: `PascalCase` (e.g., `BrowserManager`, `AuthModule`).
- **Files**:
  - Modules/Classes: `PascalCase` or `camelCase` (matching export).
  - Utils: `camelCase`.
- **Directories**: `kebab-case` (e.g., `ui-modules`, `auth-providers`) or PascalCase for Major Systems.

---

## 4. Testing Rules & Quality Assurance

### 4.1 Test Case Structure
All new features must include a Verification Plan.
- **Unit Tests**: Place in `tests/` (if using Jest/Mocha).
- **Manual Verification**: Document steps in a `walkthrough.md`.
    1. **Pre-conditions**: "User is logged in as Admin".
    2. **Action**: "Click button X".
    3. **Expected Result**: "Modal Y opens".
    4. **Actual Result**: "Pass/Fail".

### 4.2 System Verification
- **Iron Browser Check**: Verify `BrowserManager` loads the portable binary.
- **IPHey Score**: Must maintain 5/5 score.
- **Regression**: Check `TaskStatus` boundary before merging code.

## 5. Deployment Scripts

### 5.1 Build Process
1. **Clean**: Remove `dist/` and `node_modules` (if suspect).
2. **Install**: `npm install` (Use exact versions in `package.json`).
3. **Build**: `npm run build`.
   - **Windows**: Produces `.exe` and `win-unpacked` in `dist/`.
   - **Mac**: Produces `.dmg` in `dist/`.

### 5.2 Server/Database Deployment
1. **Env Setup**: Ensure `.env` contains DB credentials.
2. **Migration**:
   - Run `npm start`.
   - `mysql.js` auto-creates tables (`CREATE TABLE IF NOT EXISTS`).
   - `seed.js` auto-injects default Admin (`admin`/`Kien123!!`).
3. **Validation**: Check `audit_log` table creation.

---

## 6. Refactoring Rules
1. **Identify the Seam**: Find where one feature ends and another begins.
2. **Extract**: Move code to a new file.
3. **Verify**: Ensure no global variables are broken.
4. **Document**: Add a header comment to the new file.
5. **Delete**: Remove the dead code from the old file.

---

## 5. Deployment & Build
- **Clean Build**: Always test `npm run build` after structural changes.
- **Version Control**: Atomic commits. One feature/refactor per commit.
