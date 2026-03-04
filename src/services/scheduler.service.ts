import { FeedService } from './feed.service';
import { logger } from '../utils/logger';

export class SchedulerService {
  private feedService: FeedService;
  private interval: number;
  private timerId: NodeJS.Timeout | null = null;

  constructor(feedService: FeedService, interval: number = 3600000) {
    this.feedService = feedService;
    this.interval = interval;
  }

  public async start(): Promise<void> {
    logger.info(`Starting feed refresh scheduler (interval: ${this.interval}ms)`);
    
    await this.refreshFeeds();
    
    this.timerId = setInterval(async () => {
      await this.refreshFeeds();
    }, this.interval);
  }

  public async stop(): Promise<void> {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      logger.info('Feed refresh scheduler stopped');
    }
  }

  private async refreshFeeds(): Promise<void> {
    try {
      logger.info('Starting scheduled feed refresh');
      const articles = await this.feedService.fetchAllFeeds();
      logger.info(`Feed refresh completed: ${articles.length} articles processed`);
    } catch (error) {
      logger.error('Feed refresh failed:', error);
    }
  }
}
