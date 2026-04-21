import dotenv from 'dotenv';

dotenv.config();

const env = process.env;

const nodeEnv = env.NODE_ENV?.trim() || 'development';
const clientOrigin = env.CLIENT_ORIGIN?.trim() || 'http://localhost:5173';

const jwtPrivateKey = env.JWT_PRIVATE_KEY?.trim();
if (!jwtPrivateKey) {
  throw new Error('JWT_PRIVATE_KEY environment variable is not set');
}

const jwtPublicKey = env.JWT_PUBLIC_KEY?.trim();
if (!jwtPublicKey) {
  throw new Error('JWT_PUBLIC_KEY environment variable is not set');
}

const refreshSecret = env.REFRESH_SECRET?.trim();
if (!refreshSecret) {
  throw new Error('REFRESH_SECRET environment variable is not set');
}

const portRaw = env.PORT?.trim();
const portParsed = portRaw ? Number.parseInt(portRaw, 10) : NaN;

const smtpPortRaw = env.SMTP_PORT?.trim();
const smtpPortParsed = smtpPortRaw ? Number.parseInt(smtpPortRaw, 10) : NaN;

export const config = {
  app: {
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    clientOrigin,
    port: Number.isNaN(portParsed) ? 4000 : portParsed,
  },
  auth: {
    jwtPrivateKey: jwtPrivateKey.replace(/\\n/g, '\n'),
    jwtPublicKey: jwtPublicKey.replace(/\\n/g, '\n'),
    refreshSecret,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || undefined,
  },
  redis: {
    url: env.REDIS_URL?.trim() || 'redis://localhost:6379',
  },
  webPush: {
    publicKey: env.VAPID_PUBLIC_KEY?.trim() || '',
    privateKey: env.VAPID_PRIVATE_KEY?.trim() || '',
    email: env.VAPID_EMAIL?.trim() || 'mailto:admin@example.com',
  },
  smtp: {
    host: env.SMTP_HOST?.trim() || undefined,
    port: Number.isNaN(smtpPortParsed) ? 587 : smtpPortParsed,
    user: env.SMTP_USER?.trim() || undefined,
    pass: env.SMTP_PASS?.trim() || undefined,
    from: env.SMTP_FROM?.trim() || 'noreply@teamchat.dev',
  },
} as const;
