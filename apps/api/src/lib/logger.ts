import { pino, type LoggerOptions } from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

/**
 * Anything matching these paths is replaced with [redacted] before a log line
 * is written. The list is deliberately broad: it is far cheaper to over-redact
 * than to discover a refresh token in a log aggregator.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-paystack-signature"]',
  'res.headers["set-cookie"]',
  'password',
  'currentPassword',
  'confirmPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'tokenHash',
  'secret',
  'authorization',
  'credentials',
  'authorizationCode',
  '*.password',
  '*.accessToken',
  '*.refreshToken',
  '*.secretKey',
  '*.clientSecret',
  '*.cardNumber',
  '*.cvv',
];

const options: LoggerOptions = {
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'meridian-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

export const logger = isProduction
  ? pino(options)
  : pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
      },
    });

export type Logger = typeof logger;
