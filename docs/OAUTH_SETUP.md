# Autopolis Royal OAuth setup and production readiness

OAuth routes are implemented in `api/connected.js` and `api/oauth.js`. Provider tokens are encrypted with AES-256-GCM and stored in the server-only `autopolis_private` schema. The public `connected_accounts` table contains account metadata only.

## Render environment (set once)

- `AUTOPOLIS_PUBLIC_URL=https://autopolis-royal-v3.onrender.com`
- `AUTOPOLIS_TOKEN_ENCRYPTION_KEY` — 32 random bytes as base64 or 64 hex characters. Generate in Termux: `openssl rand -base64 32`.
- `AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN` — existing owner token. Never put it in frontend env vars or source.

## YouTube: development vs production

### Current development/testing setup

Enable YouTube Data API v3 in the Google Cloud project used by `GOOGLE_CLIENT_ID`. In Google Auth Platform, configure the OAuth audience as External and add the developer account under Test users while testing.

Testing mode is not the long-term public-user setup: Google limits it to the test-user list (up to 100), and authorizations for non-basic YouTube scopes expire after 7 days. Do not keep adding every intended user as a tester.

### Production setup (one-time Google Cloud owner actions)

1. Open [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience) in the exact project associated with `GOOGLE_CLIENT_ID`.
2. Change the publishing status from Testing to **In production** (Publish app). This removes the test-user allowlist gate for general Google accounts; it does not itself mean sensitive-scope verification is complete.
3. In [Google Auth Platform → Data Access](https://console.cloud.google.com/auth/scopes), keep only the scopes Autopolis actually needs:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
4. Complete Google OAuth app verification if the console requires it for the requested scopes/branding. Provide a public homepage, privacy policy, support contact, scope justification, and a demo video showing the actual connect/channel use. The privacy policy route is `/privacy`; update its contact section with a monitored support email before submitting.
5. Google requires ownership verification for domains listed as Authorized domains. The current Render host is a shared `onrender.com` subdomain; if Google will not accept it as a verified authorized domain, use a domain you control and point it to Render before submitting verification. Do not claim domain ownership of `onrender.com`.
6. Add the exact OAuth callback below to the same Web application OAuth client used by Render. Multiple registered redirect URIs are allowed; the URI sent by Autopolis must match one of them byte-for-byte.

Authorized redirect URI:

`https://autopolis-royal-v3.onrender.com/api/oauth/youtube/callback`

Set these Render environment variables once:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The connect request now asks Google to show an account chooser (`select_account`) as well as consent, so users can pick the intended Google account each time. Each account still needs to approve its own YouTube channel access once.

### YouTube API upload audit

OAuth app verification and the YouTube API Services compliance audit are different processes. As of the YouTube Data API revision dated November 2, 2026, uploads from unverified API projects are no longer automatically restricted to private. An audit is for quota/compliance review when required; it is not the fix for Google's OAuth Testing-mode 403.

## Meta (Facebook Pages + Instagram Business)

Create a Meta developer app, enable Facebook Login and required Page/Instagram products, then register:

`https://autopolis-royal-v3.onrender.com/api/oauth/meta/callback`

Set `META_APP_ID`, `META_APP_SECRET`, and `META_API_VERSION=v24.0`. In Meta development mode, only app roles/testers can connect until the required App Review and business/account requirements are satisfied.

Each successful connect can return multiple Facebook Pages and linked Instagram Business accounts. Reconnect with another Facebook login to add more accounts.

## Owner connect flow

Open Connected Accounts, enter the owner lifecycle token, then tap Connect. The token is kept only in that page's memory and sent as an Authorization header; it is not saved to localStorage. OAuth tokens remain encrypted server-side. After OAuth completes, reconnect again to add another provider account.
