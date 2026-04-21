// ─────────────────────────────────────────────────────────────────────────────
// Client config — the single place that reads import.meta.env.
// No other file should access import.meta.env directly.
//
// VITE_API_URL: base URL prepended to every API request.
//   • Leave empty in development — Vite proxy handles routing to localhost:4000.
//   • Set to https://api.yourdomain.com in production.
// ─────────────────────────────────────────────────────────────────────────────

const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const config = {
  // Base URL for REST API calls — empty string means same-origin (relative paths).
  apiUrl,

  // Socket.io server URL — same value works for both HTTP and WS.
  socketUrl: apiUrl || '/',

  // Google OAuth Client ID — must match GOOGLE_CLIENT_ID in server/.env
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',

  isDev:  import.meta.env.DEV  ?? false,
  isProd: import.meta.env.PROD ?? false,

  // TURN server for WebRTC relay traffic.
  // Required when peers are on different networks post-deployment (symmetric NATs
  // block direct P2P; STUN alone is insufficient).
  // Set in .env.production:
  //   VITE_TURN_URL=turn:your-turn-server.com:3478
  //   VITE_TURN_USERNAME=your-username
  //   VITE_TURN_CREDENTIAL=your-credential
  turn: import.meta.env.VITE_TURN_URL
    ? {
        url:        import.meta.env.VITE_TURN_URL,
        username:   import.meta.env.VITE_TURN_USERNAME   ?? '',
        credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
      }
    : null,
};
