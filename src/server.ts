import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { DatabaseService } from './services/database.service';
import { FeedService } from './services/feed.service';
import { SchedulerService } from './services/scheduler.service';
import apiRoutes from './routes/api.routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

dotenv.config();

const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL || '3600000', 10);

class ThreatFeedServer {
  private app: Application;
  private dbService: DatabaseService;
  private feedService: FeedService;
  private schedulerService: SchedulerService;

  constructor() {
    this.app = express();
    this.dbService = new DatabaseService();
    this.feedService = new FeedService(this.dbService);
    this.schedulerService = new SchedulerService(this.feedService, REFRESH_INTERVAL);
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    }));

    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  private initializeRoutes(): void {
    this.app.use('/api', apiRoutes(this.feedService, this.dbService));

    this.app.get('/', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/advisories', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/indicators', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/research', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/settings', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      await this.dbService.initialize();
      logger.info('Database initialized');

      await this.schedulerService.start();
      logger.info('Feed refresh scheduler started');

      this.app.listen(PORT, () => {
        logger.info(`Threat Feed Aggregator running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    await this.schedulerService.stop();
    await this.dbService.close();
    logger.info('Server stopped gracefully');
  }
}

const server = new ThreatFeedServer();

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

server.start().catch((error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
