import { Link } from 'react-router-dom';

export function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-slate-200">
      <Link to="/" className="text-sm font-semibold text-amber-300">← Autopolis Royal</Link>
      <h1 className="mt-4 font-display text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: November 26, 2026</p>
      <p className="mt-5 text-sm leading-7 text-slate-300">Autopolis Royal provides a city simulation and connected social-account tools. This policy explains the information processed when you connect a Google account to the YouTube integration.</p>

      <h2 className="mt-6 text-lg font-bold text-white">Information we access</h2>
      <p className="mt-2 text-sm leading-7 text-slate-300">When you choose to connect YouTube, Google asks you to approve the requested permissions. Autopolis requests YouTube upload access and read-only channel access. We receive the authorized channel's ID, channel name, channel thumbnail, OAuth access token, refresh token when Google returns one, token expiry, and granted scopes.</p>

      <h2 className="mt-6 text-lg font-bold text-white">How we use information</h2>
      <p className="mt-2 text-sm leading-7 text-slate-300">We use this information only to identify the connected YouTube channel, maintain its connection, and perform YouTube actions you initiate through Autopolis, such as uploading content. We do not use YouTube data to build advertising profiles or sell it.</p>

      <h2 className="mt-6 text-lg font-bold text-white">Storage and security</h2>
      <p className="mt-2 text-sm leading-7 text-slate-300">OAuth tokens are encrypted with AES-256-GCM before being stored in a private, server-only database schema. Channel display information is stored separately for the Connected Accounts interface. Tokens are not placed in frontend source code or shown in the interface.</p>

      <h2 className="mt-6 text-lg font-bold text-white">Retention and deletion</h2>
      <p className="mt-2 text-sm leading-7 text-slate-300">The connection data is retained while the channel remains connected. You can disconnect a channel from Connected Accounts; this removes its stored OAuth tokens and connected-account record. You can also revoke Autopolis access from your Google Account's third-party connections settings.</p>

      <h2 className="mt-6 text-lg font-bold text-white">Third-party services and contact</h2>
      <p className="mt-2 text-sm leading-7 text-slate-300">Google handles sign-in, consent, and YouTube API access under Google's own privacy terms. Autopolis is hosted on Render and uses Supabase for database storage. For privacy questions or deletion requests, contact the support email published on the Autopolis Royal Google OAuth consent screen.</p>

      <p className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs leading-6 text-amber-100">Before Google verification submission, the app owner must replace the support-contact reference above with a monitored contact address and ensure this policy accurately reflects the deployed service.</p>
    </main>
  );
}
