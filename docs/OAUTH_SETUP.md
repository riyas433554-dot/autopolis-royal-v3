# Autopolis Royal OAuth setup

The OAuth routes are implemented in `api/connected.js` and `api/oauth.js`. Provider tokens are AES-256-GCM encrypted and stored in the server-only `autopolis_private` schema. The public `connected_accounts` rows contain account metadata only.

## Render environment

Set these once on the Autopolis web service:

- `AUTOPOLIS_PUBLIC_URL=https://autopolis-royal-v3.onrender.com`
- `AUTOPOLIS_TOKEN_ENCRYPTION_KEY` — 32 random bytes encoded as base64 or 64 hex characters. Generate in Termux with `openssl rand -base64 32`.
- `AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN` — existing owner token used by ECC/agent actions. Do not expose it in frontend environment variables.

## Meta (Facebook Pages + Instagram Business)

Create a Meta developer app, enable Facebook Login and the required Page/Instagram products, then add this exact OAuth redirect URI:

`https://autopolis-royal-v3.onrender.com/api/oauth/meta/callback`

Set:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_API_VERSION=v24.0` (can be changed if Meta requires a newer supported version)

The connect flow requests Page listing/engagement and Instagram basic/content-publish permissions. In development mode, only app roles/testers can connect until Meta App Review and business/account requirements are satisfied.

Each OAuth connect can return multiple Facebook Pages and linked Instagram Business accounts. Reconnect with another Facebook login to add additional accounts.

## YouTube

Enable YouTube Data API v3 in the Google Cloud project, configure the OAuth consent screen and authorized test users, then add this exact redirect URI:

`https://autopolis-royal-v3.onrender.com/api/oauth/youtube/callback`

Set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The flow requests YouTube upload and read-only channel scopes. Each Google account must authorize separately; every returned channel is stored as a separate connected account. Unverified Google projects may be restricted to private uploads until verification.

## Owner connect flow

Open Connected Accounts, enter the owner lifecycle token, then tap Connect. The token is used only in that page's memory and sent as an Authorization header; it is not saved to localStorage. After OAuth completes, reconnect again to add another provider account.
