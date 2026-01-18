# Workflow Automation Engine

## 1. Visual Editor (Drawflow)
The UI uses `drawflow` library to create a node-based graph.
- **Frontend**: `renderer.js` handles the UI logic (drag/drop nodes).
- **Data Structure**: JSON Graph.
- **Node Types**:
  - `start`: Entry point.
  - `click`: Action. Params: Selector (CSS/XPath).
  - `type`: Action. Params: Selector, Text.
  - `wait`: Control Flow. Params: Milliseconds.
  - `find`: Assertion. Params: Selector.
  - `twofa`: Special. Generates TOTP code using account secret.

## 2. Execution Engine (`AutomationManager.js`)
The backend component that interprets the JSON graph.

### Execution Flow
1. **Traverse**: Start at `start` node. Find output connection (Next Node ID).
2. **Resolve**: Look up Node Data by ID.
3. **Execute**: Switch-case on Node Type.
   - **Click**: `await page.click(selector)`
   - **Type**: `await page.type(selector, text, {delay: 50})`
   - **2FA**:
     - Fetch secret from `account.auth_config`.
     - Generate Token -> Type into field.

### Selector Logic
- Supports **CSS Selectors** (e.g., `#login-btn`, `.class`).
- Supports **Picker Interaction**: The "Picker Mode" allows users to click elements on a real page to auto-fill the selector field in the graph.

## 3. Error Handling
- **Timeout**: Each action has a default timeout (e.g., 5s).
- **Failure**: If a node fails (element not found), the workflow aborts and logs the error to the console.

## 4. Automated Login ("Auto" Mode)
- **Concept**: A specific workflow is assigned to an Account.
- **Trigger**: `BrowserManager.launchBrowser` checks `automation_mode === 'auto'`.
- **Action**: Immediately runs the assigned workflow upon navigation to `login_url`.
