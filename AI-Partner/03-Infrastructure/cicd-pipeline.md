# CI/CD Pipeline & Build System

## 1. Automation Workflow (GitHub Actions)
The project uses GitHub Actions to automate the cross-platform build process.
- **Config File**: `.github/workflows/build.yml`
- **Trigger**: Pushing a tag starting with `v*` (e.g., `v1.0.3`).

### Strategy Matrix
We run parallel jobs on:
1. `windows-latest` -> Builds `.exe` (NSIS Installer) + Portable.
2. `macos-latest` -> Builds `.dmg` (Disk Image) + `.zip` (Application).

## 2. Electron Builder Configuration
The build logic is defined in `package.json` under the `"build"` key.

### Windows (`win`)
- **Target**: `nsis` (Standard Installer).
- **Arch**: `x64`.
- **Icon**: `build/icon.png`. (Must ensure transparency).

### macOS (`mac`)
- **Target**: `dmg` (Standard Drag-Install) + `zip`.
- **Arch**: Universal / Dual Target (`x64` Intel + `arm64` Apple Silicon).
- **Signing**: Currently set to **Ad-Hoc** (No Apple Developer ID required, but users may see security warnings).

## 3. Release Process
1. **Developer**:
   - `rpm version patch` (Bumps package.json).
   - `git commit` changes.
   - `git tag vX.Y.Z`.
   - `git push origin vX.Y.Z`.
2. **GitHub Actions**:
   - Checks out code.
   - Installs Node 18.
   - Runs `npm run build`.
3. **Publishing**:
   - Uses `softprops/action-gh-release`.
   - **Critical**: Explicitly uploads `dist/*.exe` and `dist/*.dmg` to the GitHub Release page (not just internal logs).

## 4. Troubleshooting Builds
- **Error**: "Process completed with exit code 1" on File Upload.
  - **Cause**: Missing Write Permissions on `GITHUB_TOKEN`.
  - **Fix**: Add `permissions: contents: write` to workflow YAML.
- **Error**: "Icon missing".
  - **Cause**: `build/icon.png` is not committed.
  - **Fix**: Check `.gitignore` and ensure build assets are forced added.
