# Windows desktop connection to kaampi Codex

Explore's Tauri foundation supports an administrator-approved connection without
copying an application key. The browser version retains its existing server setup.

## Try the desktop connection

1. Update the kaampi Codex service to a build containing the pairing endpoints.
   Updating source files does not update an already running service or old installer.
2. With Tauri's Windows prerequisites installed, run `npm install`, then
   `npm run desktop:dev` in Explore. Rust, Microsoft C++ Build Tools and WebView2
   are development prerequisites.
3. Choose **kaampi Codex** near Settings, then **Connect to kaampi Codex**.
4. Open Codex management. Unlock management using its existing administrator
   authentication, then find **Anslut appar**. Refresh the list if necessary.
5. Compare the six-character code with Explore and select **Tillåt**.
6. Explore retrieves its credential in the native process and saves it in Windows
   Credential Manager. The interface receives only connection status.

The app is identified as `sandbox` in the existing Codex protocol; display names
use kaampi Explore. No Write credential or administrator privilege is granted to
Explore. The connection is to the local service at `127.0.0.1:43127`.

## Protocol and limits

- Native client: `POST /v1/pairing` with `{"app":"sandbox"}`. Only the native
  process keeps the returned proof; the webview receives a comparison code and expiry.
- Administrator: `GET /admin/api/pairing`, then `POST /admin/api/pairing` with an
  attempt ID and explicit approval/denial. Existing admin authentication is required.
- Native client: `POST /v1/pairing/:id/claim` with its proof. Polling is serial,
  every two seconds. A token is issued only after approval and is returned once.
- Attempts expire after five minutes and disappear on service restart. Up to 32
  attempts may be outstanding. Unknown app identities and browser-origin requests
  are rejected. Approval itself never returns the credential to the admin page.
- **Disconnect this device** removes the saved local credential. It does not revoke
  other credentials or delete Codex content.
- Shared-manuscript reads use the native credential and the same validated
  projection as the browser server reader. Core ownership and sharing checks remain
  authoritative.

This introduces the Windows desktop foundation and connection workflow, not a
published desktop release. A live approval/credential-storage smoke test and a
complete desktop feature review are required before distributing an installer.
