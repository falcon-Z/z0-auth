# OAuth confidential server sample

Create a confidential interactive Client beneath your Application for this flow. Register its callback and explicitly enable refresh if needed. Use a separate confidential workload Client for the Client Credentials example below.

Backend-style authorization code flow (no PKCE; uses client secret on the server only).

## Flow

Register a Resource such as `https://api.example.com/orders`, expose `openid`, `profile`, and `email`, and permit the interactive Client to request those scopes before starting the flow. A token exchange or refresh inherits that selected audience. Resource servers must check the exact audience.

1. Send the user to the authorize URL (browser):

```
http://localhost:3000/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&resource=https%3A%2F%2Fapi.example.com%2Forders&redirect_uri=http://localhost:3000/oauth/callback&scope=openid%20profile%20email&state=RANDOM_STATE
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
  -d 'resource=https://api.example.com/orders' \
  -d 'scope=read:orders'
```

Register `https://api.example.com/orders` as a Resource, expose `read:orders` from the owning Application vocabulary, and explicitly permit the workload Client to request that Resource and scope. New Clients have no implicit Resource permissions.


Client-secret rotation uses the console's **Secrets** controls: add a new secret, deploy it to the server and confirm its last successful use, then revoke the old secret. Both secrets authenticate the same Client ID during deployment. Values are shown once; losing one requires creating a replacement. Optional per-secret expiry is available with no mandatory default. For suspected compromise, revoke immediately using the explicit compromise option, including when it is the last secret. Already-issued short-lived access tokens expire normally.

The token endpoint also accepts HTTP Basic (`client_secret_basic`), for example `curl --user 'CLIENT_ID:CLIENT_SECRET' …` with form fields for the grant and Resource. Use one authentication method in each request; do not combine Basic with a form `client_secret`.
