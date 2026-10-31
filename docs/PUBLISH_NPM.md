# Publishing Deskbird to npm

Deskbird is published to the public npm registry under the package name **`deskbird`**, enabling any user to launch the desktop companion with a single command:
```powershell
npx deskbird
```

---

## 1. Package Name Availability Confirmation

The package name `deskbird` was verified directly against the public npm registry and returned `404 Not Found`, confirming the name is free and available to register:
```powershell
npm view deskbird
# npm error 404 Not Found - GET https://registry.npmjs.org/deskbird
```

---

## 2. Prerequisites & Authentication

1. Ensure you have an active account on [npmjs.com](https://www.npmjs.com/).
2. Log in from your local terminal:
   ```powershell
   npm login
   ```
3. Verify your authenticated identity:
   ```powershell
   npm whoami
   ```

---

## 3. Pre-Publish Dry Run (`npm pack`)

Always test what will be included in the tarball before publishing:

```powershell
cd bird
npm pack --dry-run
```

Verify that only the intended whitelist files are included:
- `bin/deskbird.js`
- `src/**/*`
- `package.json`
- `electron-builder.yml`
- Assets (PNG spritesheets, tray icons, fonts)

No test folders, caches, or root configuration files should be present.

---

## 4. Manual Publishing with Provenance

To publish manually from your terminal:

```powershell
cd bird
npm publish --access public --provenance
```

> **Note**: `--provenance` links the published package cryptographically to the GitHub Actions build and commit history for supply chain security.

---

## 5. Automated CI/CD Publishing via GitHub Actions

The repository includes `.github/workflows/release.yml` which automates publishing whenever a version tag is pushed:

1. Create a personal access token (Publish type) in your [npm Account Settings > Access Tokens](https://www.npmjs.com/settings/tokens).
2. Add the token to your GitHub repository secrets:
   - Go to **Settings > Secrets and variables > Actions**.
   - Create a secret named **`NPM_TOKEN`** with your token value.
3. When ready to release, bump the version and push a Git tag:
   ```powershell
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. GitHub Actions will:
   - Run tests and linting.
   - Build the web bundle.
   - Publish `deskbird@1.0.0` to npm with provenance.
   - Build the Windows NSIS installer (`.exe`) via `electron-builder`.
   - Create a GitHub Release with the executable attached.

---

## 6. Versioning, Deprecation, & Rollback

- **Semantic Versioning**: Always use strict semver (`1.0.0`, `1.0.1`, `1.1.0`).
- **Unpublishing Policy**: npm only allows unpublishing within 72 hours of publication. If a critical bug is released after that window:
  ```powershell
  # Mark version as deprecated with a warning
  npm deprecate deskbird@1.0.0 "Critical bug, please upgrade to 1.0.1"

  # Publish patched version
  npm version patch
  npm publish --access public
  ```

