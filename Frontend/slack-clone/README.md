# Saviman — Frontend

A real-time team communication app built with React, Vite, Socket.io, and TailwindCSS. Supports messaging, threads, reactions, presence, audio/video calling, and workspace management.

---

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 18 |
| Routing | React Router v6 |
| State | Zustand |
| Server state | TanStack Query v5 |
| Real-time | Socket.io-client |
| Styling | TailwindCSS v3 |
| Build | Vite 5 |
| Auth | Google OAuth (`@react-oauth/google`) |

---

## Project Structure

```
src/
├── components/
│   ├── auth/          # Google sign-in button
│   ├── calling/       # CallBar, VideoGrid, AudioCallPanel, IncomingCallModal
│   ├── layout/        # WorkspaceLayout, Sidebar
│   ├── messages/      # MessageList, MessageComposer, ThreadPanel
│   ├── notifications/ # NotificationBell
│   ├── search/        # SearchModal
│   ├── ui/            # Avatar, Modal, PresenceDot, ErrorBoundary
│   └── workspace/     # CreateChannelModal, WorkspaceMembersModal
├── hooks/             # useAuth, useCall, useMessages, useSocket, useWebRTC, ...
├── lib/               # api.js, socket.js, events.js, config.js, queryClient.js
├── pages/             # LoginPage, RegisterPage, WorkspaceSelectPage, ChannelPage, InvitePage
└── stores/            # authStore, callStore, channelStore, messageStore, presenceStore, ...
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Backend running at `http://localhost:4000`

### Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies all API and WebSocket requests to `localhost:4000` automatically.

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Leave empty in development (Vite proxy handles it)
VITE_API_URL=

# From Google Cloud Console → OAuth 2.0 Client ID
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

---

## Deployment

The app is deployed on **Vercel**.

1. Set `VITE_API_URL=https://savimanapi.serveminecraft.net` in Vercel environment variables
2. Push to `main` — Vercel auto-deploys

`vercel.json` rewrites all routes to `index.html` for SPA routing.

---

## Key Features

- **Workspaces** — Create, join via invite link or email invite (one-time, email-locked)
- **Channels** — Public and private text channels
- **Direct Messages** — One-on-one DMs
- **Threads** — Reply to any message in a thread panel
- **Reactions** — Emoji reactions on messages
- **Presence** — Real-time online/away/DND status
- **Calling** — WebRTC audio and video calls with group call support
- **Notifications** — In-app notification bell
- **Search** — Full-text message search

---

## Architecture Notes

- `useSocket` wires all Socket.io server→client events to Zustand stores — called once in `App.jsx`
- `useWebRTC` manages RTCPeerConnection lifecycle for calls
- `useSessionRestore` attempts a token refresh from the HttpOnly cookie on app load
- All modals that live inside the Sidebar use `createPortal` to avoid CSS transform stacking context issues
- Invite tokens are one-time use and optionally locked to a specific email address
