import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { buildRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(options: { loginRateLimit?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / server-to-server requests (no Origin header) and configured origins.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  app.get('/', (_req, res) => res.json({ name: 'SMJ Jewellery API', docs: '/api/health' }));
  app.use('/api', buildRouter({ loginRateLimit: options.loginRateLimit ?? env.NODE_ENV !== 'test' }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
