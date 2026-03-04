"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const database_service_1 = require("./services/database.service");
const feed_service_1 = require("./services/feed.service");
const scheduler_service_1 = require("./services/scheduler.service");
const api_routes_1 = __importDefault(require("./routes/api.routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const logger_1 = require("./utils/logger");
dotenv_1.default.config();
const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL || '3600000', 10);
class ThreatFeedServer {
    constructor() {
        this.app = (0, express_1.default)();
        this.dbService = new database_service_1.DatabaseService();
        this.feedService = new feed_service_1.FeedService(this.dbService);
        this.schedulerService = new scheduler_service_1.SchedulerService(this.feedService, REFRESH_INTERVAL);
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }
    initializeMiddleware() {
        this.app.use((0, helmet_1.default)({
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
        this.app.use((0, cors_1.default)({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true,
        }));
        this.app.use((0, compression_1.default)());
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: 15 * 60 * 1000,
            max: 100,
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);
        this.app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
    }
    initializeRoutes() {
        this.app.use('/api', (0, api_routes_1.default)(this.feedService, this.dbService));
        this.app.get('/', (_req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
        this.app.get('/advisories', (_req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
        this.app.get('/indicators', (_req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
        this.app.get('/research', (_req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
        this.app.get('/settings', (_req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
        this.app.get('*', (_req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
        });
    }
    initializeErrorHandling() {
        this.app.use(error_middleware_1.errorHandler);
    }
    async start() {
        try {
            await this.dbService.initialize();
            logger_1.logger.info('Database initialized');
            await this.schedulerService.start();
            logger_1.logger.info('Feed refresh scheduler started');
            this.app.listen(PORT, () => {
                logger_1.logger.info(`Threat Feed Aggregator running on port ${PORT}`);
                logger_1.logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }
    async stop() {
        await this.schedulerService.stop();
        await this.dbService.close();
        logger_1.logger.info('Server stopped gracefully');
    }
}
const server = new ThreatFeedServer();
process.on('SIGINT', async () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    await server.stop();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
});
server.start().catch((error) => {
    logger_1.logger.error('Fatal error during startup:', error);
    process.exit(1);
});
