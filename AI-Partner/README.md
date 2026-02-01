# AI-Partner: The Complete Login Tab Documentation

Welcome to the **Login Tab** Knowledge Base. This directory is structurally optimized to help AI Agents (like you!) understand, maintain, and extend the project.

## 📂 Directory Structure

### [00-System-Overview](./00-System-Overview)
Start here to understand what we are building.
- **[architecture.md](./00-System-Overview/architecture.md)**: The map of the territory. Main/Renderer/IPC.
- **[tech-stack.md](./00-System-Overview/tech-stack.md)**: The tools we use (Electron, Puppeteer, MySQL).

### [01-Core-Features](./01-Core-Features)
Business logic and critical systems.
- **Authentication**: Usage of RBAC, `users` table, permissions.
- **Session Management**: How we sync `UserDataDirs` across devices.
- **Network Layer**:
  - **[proxy-architecture.md](./01-Core-Features/Network-Layer/proxy-architecture.md)**: How `proxy-chain` handles auth and prevents leaks.

### [02-Browser-Automation](./02-Browser-Automation)
The "Heart" of the application.
- **Stealth-Engine**: 
  - **[evasion-strategies.md](./02-Browser-Automation/Stealth-Engine/evasion-strategies.md)**: General bot detection bypass.
  - **[google-login-bypass.md](./02-Browser-Automation/Stealth-Engine/google-login-bypass.md)**: **CRITICAL**: The exact formula for Google Login (Real Chrome + Zero Noise).
- **Workflows**: How the Visual Node Editor translates to specific Actions.

### [03-Infrastructure](./03-Infrastructure)
Backend and DevOps.
- **Database**: Full MySQL Schema reference.
- **CI/CD**: Configuring GitHub Actions for Windows/Mac builds.

### [04-Developer-Guide](./04-Developer-Guide)
For new contributors or setup.
- **[setup-environment.md](./04-Developer-Guide/setup-environment.md)**: Node/MySQL requirements and installation.

### [05-Troubleshooting](./05-Troubleshooting)
When things go wrong.
- **[common-issues.md](./05-Troubleshooting/common-issues.md)**: Fixes for "Keyboard missing", "mf.dll error", and DB connection failures.

## 🤖 How to use this documentation
1. **Context Loading**: When starting a new session, verify the **Architecture** and **Database Schema** first to ground your understanding.
2. **Feature Extension**: If asked to add a new node type, check **Workflows/execution-engine.md**.
3. **Debugging**: If the user reports a specific detection (e.g. "Gmail 2FA triggered"), check **Stealth-Engine/google-login-bypass.md**.
4. **Maintenance**: If the app crashes on Windows N, check **Troubleshooting/common-issues.md**.

---
*Created automatically for AI-Assisted Development.*
