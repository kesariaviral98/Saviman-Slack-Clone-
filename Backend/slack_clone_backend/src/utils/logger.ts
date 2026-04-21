import pino from 'pino';
import { config } from '../config/config';

export const logger = pino(
  config.app.isDevelopment
    ? {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {
        level: 'info',
      },
);
