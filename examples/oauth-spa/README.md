# OAuth SPA sample

Minimal browser app for testing PKCE + CORS against z0-auth.

## Setup

1. Register a **public** app in the console with redirect URI `http://localhost:5173/callback` (or match your static server URL).
2. Serve this folder on port 5173, for example:

```bash
cd examples/oauth-spa
bunx serve -p 5173 .
```

3. Open `http://localhost:5173`, paste your `client_id`, and click **Sign in**.

## What it demonstrates

- Authorization code flow with PKCE and `state`
- Token exchange from the browser (requires P4M6 CORS on `/oauth/token`)
- Userinfo call with the access token

Never put a `client_secret` in browser code.
