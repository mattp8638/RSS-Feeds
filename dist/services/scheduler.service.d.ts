import { FeedService } from './feed.service';
export declare class SchedulerService {
    private feedService;
    private interval;
    private timerId;
    constructor(feedService: FeedService, interval?: number);
    start(): Promise<void>;
    stop(): Promise<void>;
    private refreshFeeds;
}
//# sourceMappingURL=scheduler.service.d.ts.map