"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const logger_1 = require("../utils/logger");
class SchedulerService {
    constructor(feedService, interval = 3600000) {
        this.timerId = null;
        this.feedService = feedService;
        this.interval = interval;
    }
    async start() {
        logger_1.logger.info(`Starting feed refresh scheduler (interval: ${this.interval}ms)`);
        await this.refreshFeeds();
        this.timerId = setInterval(async () => {
            await this.refreshFeeds();
        }, this.interval);
    }
    async stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
            logger_1.logger.info('Feed refresh scheduler stopped');
        }
    }
    async refreshFeeds() {
        try {
            logger_1.logger.info('Starting scheduled feed refresh');
            const articles = await this.feedService.fetchAllFeeds();
            logger_1.logger.info(`Feed refresh completed: ${articles.length} articles processed`);
        }
        catch (error) {
            logger_1.logger.error('Feed refresh failed:', error);
        }
    }
}
exports.SchedulerService = SchedulerService;
