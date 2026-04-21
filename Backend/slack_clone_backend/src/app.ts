// ─────────────────────────────────────────────────────────────────────────────
// app.ts — Express application setup.
// Mounts all middleware and routes. Exported for use by index.ts (startup)
// and for testing without binding to a port.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'express-async-errors';

import {
  authRouter, workspaceRouter, channelRouter, messagingRouter,
  searchRouter, notificationRouter, adminRouter, callingRouter,
} from './routes';
import { errorHandler } from './middleware';
import { config } from './config/config';
import { redis, prisma } from './utils/index';

const CLIENT_ORIGIN = config.app.clientOrigin;

// ── Security ──────────────────────────────────────────────────────────────────

export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'self'"],
        connectSrc:    ["'self'", CLIENT_ORIGIN],
        imgSrc:        ["'self'", 'data:', 'https:'],
        scriptSrc:     ["'self'"],
        styleSrc:      ["'self'", "'unsafe-inline'"],
        frameAncestors:["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', async (_req, res): Promise<void> => {
  try {
    await redis.ping();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  } catch (err) {
    res.status(503).json({ success: false, error: 'Service unavailable' });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/auth',          authRouter);
app.use('/workspaces',    workspaceRouter);
app.use('/',              channelRouter);
app.use('/',              messagingRouter);
app.use('/search',        searchRouter);
app.use('/notifications', notificationRouter);
app.use('/admin',         adminRouter);
app.use('/calls',         callingRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((_req, res): void => {
  res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
});

// ── Global error handler (must be last) ──────────────────────────────────────

app.use(errorHandler);
