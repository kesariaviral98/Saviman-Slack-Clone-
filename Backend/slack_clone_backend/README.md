# Slack Clone Backend

A TypeScript backend for a Slack-like collaboration app with authentication, workspaces, channels, messaging, notifications, search, and calling support.

## Stack

- Node.js + Express
- TypeScript
- Prisma + PostgreSQL
- Redis
- Socket.IO
- Bull jobs
- Docker / Docker Compose

## Features

- JWT-based auth with optional Google sign-in
- Workspace and channel management
- Channel messaging, threads, reactions, and attachments
- Presence, notifications, and background jobs
- Full-text search support with PostgreSQL
- Calling-related APIs and Socket.IO realtime events
- Health check endpoint at `/health`

## Project Structure

```text
src/
  app.ts                Express app and middleware
  index.ts              Server startup and graceful shutdown
  config/               Environment configuration
  controllers/          Request/socket handlers
  routes/               HTTP routes
  services/             Business logic
  middleware/           Auth, RBAC, rate limit, error handling
  socket/               Socket.IO auth and server setup
  jobs/                 Background job bootstrap and workers
  utils/                Prisma, Redis, logger, queues
prisma/
  schema.prisma         Database schema
  migrations/           SQL migrations
  seed.ts               Seed script
```

## Requirements

- Node.js 20+
- PostgreSQL
- Redis

## Environment Variables

Create a `.env` file in the project root.

```env
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/teamchat
REDIS_URL=redis://localhost:6379

JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
REFRESH_SECRET=replace-me

GOOGLE_CLIENT_ID=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@teamchat.dev

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:admin@example.com
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Generate the Prisma client:

```bash
npm run db:generate
```

3. Run migrations:

```bash
npm run db:migrate
```

4. Optional: seed the database:

```bash
npm run db:seed
```

5. Start the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - start the server in watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm run start` - run the compiled server
- `npm run type-check` - run the TypeScript checker
- `npm run lint` - run ESLint
- `npm run lint:fix` - run ESLint with autofix
- `npm run db:generate` - generate Prisma client
- `npm run db:migrate` - run Prisma development migrations
- `npm run db:migrate:deploy` - apply migrations in deployed environments
- `npm run db:push` - push schema changes without a migration
- `npm run db:seed` - seed the database
- `npm run db:studio` - open Prisma Studio
- `npm run db:search-setup` - apply search setup SQL

## Docker

If your `docker-compose.yml` is configured for local dependencies, you can start the stack with:

```bash
docker compose up --build
```

## Linting

This project now includes an ESLint setup in `.eslintrc.cjs` that extends the Google style guide and adds TypeScript-aware linting through `@typescript-eslint`.

Install dependencies and run:

```bash
npm run lint
```

## Notes

- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, and `REFRESH_SECRET` are required at startup.
- The server checks both Redis and PostgreSQL connectivity before accepting traffic.
- `/health` returns `503` if Redis or the database is unavailable.
