# Saviman — Slack Clone

A production-grade, full-stack real-time team chat application built with React, Node.js, Socket.io, and WebRTC.

## Features

- **Workspaces & Channels** — Create workspaces, public/private channels, and direct messages
- **Real-time Messaging** — Instant message delivery via Socket.io with optimistic UI updates
- **Threaded Replies** — Reply to any message in a dedicated thread panel
- **Emoji Reactions** — React to messages with any emoji
- **Audio & Video Calling** — Peer-to-peer calls via WebRTC mesh topology
- **Presence & Status** — Live online/offline indicators with active, away, and do not disturb modes
- **Full-text Search** — Search messages across channels using PostgreSQL full-text search
- **Notifications** — In-app notifications with unread count badge
- **Invite System** — Invite members via shareable link or email
- **Google OAuth** — Sign in with Google in addition to email/password
- **Role-based Access** — Admin and member roles with permission-gated actions

## Tech Stack

### Frontend — [`Frontend/`](./Frontend/slack-clone/)
| | |
|---|---|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| State Management | Zustand |
| Server State | TanStack Query (React Query v5) |
| Real-time | Socket.io Client |
| Video/Audio | Native WebRTC API |
| Styling | Tailwind CSS |

### Backend — [`Backend/`](./Backend/slack_clone_backend/)
| | |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | PostgreSQL + Prisma ORM |
| Cache / Presence | Redis (ioredis) |
| Real-time | Socket.io + Redis Adapter |
| Auth | RS256 JWT + rotating refresh tokens |
| Job Queue | Bull (email & notifications) |
| File Storage | AWS S3 (presigned URLs) |
| Email | Nodemailer |
| Validation | Zod |
| Logging | Pino |

## Project Structure

```
Saviman-Slack-Clone/
├── Frontend/
│   └── slack-clone/        # React + Vite SPA
│       ├── src/
│       │   ├── components/ # UI components (messages, calling, layout, etc.)
│       │   ├── hooks/      # Custom hooks (useSocket, useWebRTC, useAuth, etc.)
│       │   ├── stores/     # Zustand state stores
│       │   ├── pages/      # Route-level page components
│       │   └── lib/        # API client, socket, config, events
│       └── ...
│
└── Backend/
    └── slack_clone_backend/ # Express + TypeScript API
        ├── src/
        │   ├── routes/      # Express routers
        │   ├── controllers/ # Socket.io event handlers
        │   ├── services/    # Business logic
        │   ├── middleware/  # Auth, RBAC, rate limiting, error handling
        │   ├── models/      # TypeScript types
        │   ├── shared/      # Zod schemas, shared types, event constants
        │   ├── jobs/        # Bull queue workers
        │   ├── socket/      # Socket.io server setup
        │   └── utils/       # Prisma, Redis, logger, Bull, socketEmitter
        └── prisma/          # Schema, migrations, seed
```

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL
- Redis

### Backend

```bash
cd Backend/slack_clone_backend
npm install
cp .env.example .env        # Fill in your environment variables
npm run db:migrate          # Run Prisma migrations
npm run db:search-setup     # Set up PostgreSQL full-text search trigger
npm run db:seed             # (Optional) Seed demo data
npm run dev                 # Start dev server
```

### Frontend

```bash
cd Frontend/slack-clone
npm install
cp .env.example .env        # Fill in your environment variables
npm run dev                 # Start Vite dev server
```

## Architecture Highlights

- **Dual transport** — Socket.io for real-time events; REST for initial data fetches and mutations
- **Token security** — Access tokens are memory-only (never persisted); sessions restored via HttpOnly refresh-token cookie
- **Optimistic updates** — Messages appear instantly; server confirmation reconciles via `clientTempId`
- **Presence** — Redis TTL-based (35s) with client heartbeat every 20s; multi-device aware
- **WebRTC** — Mesh topology using the "perfect negotiation" pattern for collision-free offer/answer exchange
- **Search** — PostgreSQL `tsvector` + GIN index populated by a DB trigger; no external search service needed
- **Scalability** — Socket.io Redis adapter enables horizontal scaling across multiple server processes

## Deployment

The backend includes a `Dockerfile` and `docker-compose.yml` for containerised deployment, along with an `nginx.conf` for reverse proxy setup.
