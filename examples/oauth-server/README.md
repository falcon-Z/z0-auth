# OAuth confidential server sample

Backend-style authorization code flow (no PKCE; uses client secret on the server only).

## Flow

1. Send the user to the authorize URL (browser):

```
http://localhost:3000/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/oauth/callback&scope=openid%20profile%20email&state=RANDOM_STATE
```

2. After login and consent, exchange the code server-side:

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=PASTE_CODE' \
  -d 'redirect_uri=http://localhost:3000/oauth/callback' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET'
```

3. Refresh when the access token expires:

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=refresh_token' \
  -d 'refresh_token=PASTE_REFRESH_TOKEN' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET'
```

4. Machine-to-machine (no user):

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET' \
  -d 'scope=read:orders'
```

Register `read:orders` (or your scope) on the app before requesting it.
