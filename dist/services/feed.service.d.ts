import { DatabaseService, Article } from './database.service';
export declare class FeedService {
    private rssParser;
    private dbService;
    constructor(dbService: DatabaseService);
    fetchAllFeeds(): Promise<Article[]>;
    fetchFeedBySource(sourceId: string): Promise<Article[]>;
    searchFeeds(query: string, days?: number, fuzzy?: boolean): Promise<Article[]>;
    private fetchFeed;
    private fetchRSSFeed;
    private fetchJSONFeed;
    private parseCISAKEV;
    private parseURLHaus;
    private parseAppleSecurityUpdates;
    private parseAOSPSecurityBulletins;
    private filterLast30Days;
    private filterLastNDays;
    private normalizeDate;
    private enrichItem;
    private matchesQuery;
    private similarity;
    private editDistance;
    private deduplicateAndSort;
    private sortItems;
}
//# sourceMappingURL=feed.service.d.ts.map