# OAuth SPA sample

Minimal browser app for testing PKCE + CORS against z0-auth.

## Setup

1. Register a **public** app in the console with redirect URI `http://localhost:5173/callback` (or match your static server URL).
2. Serve this folder on port 5173, for example:

```bash
cd examples/oauth-spa
bunx serve -p 5173 .
```

3. Open `http://localhost:5173`, paste your `client_id` and registered Resource audience URI, and click **Sign in**.

## What it demonstrates

- Authorization code flow with PKCE and `state`
- Token exchange from the browser (requires P4M6 CORS on `/oauth/token`)
- Userinfo call with the access token

Register a public interactive Client beneath your Application, set its redirect URI and explicitly register `http://localhost:5173` in browser origins. Enable refresh tokens on that Client if the example uses refresh.

Never put a `client_secret` in browser code.

Register the API Resource in **Apps → Resources**, expose `openid`, `profile`, and `email`, and permit the SPA Client to request that Resource and those scopes through **Setup → Resource access**. Each authorization selects one exact audience. Tokens from a different Resource are not authority for this API.
