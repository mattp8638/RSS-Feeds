export interface Article {
    id: string;
    title: string;
    summary: string;
    link: string;
    published: string;
    source: string;
    category: string;
    source_id: string;
    created_at: string;
}
export interface Feed {
    id: string;
    name: string;
    url: string;
    type: string;
    category: string;
    parser?: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}
export declare class DatabaseService {
    private db;
    private readonly dbPath;
    constructor(dbPath?: string);
    initialize(): Promise<void>;
    private createTables;
    private initializeDefaultFeeds;
    upsertArticles(articles: Omit<Article, 'created_at'>[]): void;
    fetchLatestArticles(limit?: number): Article[];
    fetchArticlesForSource(sourceId: string): Article[];
    fetchArticlesLastNDays(days: number): Article[];
    deleteOlderThan(days: number): void;
    getAllFeeds(): Feed[];
    getEnabledFeeds(): Feed[];
    getFeedById(id: string): Feed | undefined;
    createFeed(feed: Omit<Feed, 'created_at' | 'updated_at'>): Feed;
    updateFeed(id: string, updates: Partial<Omit<Feed, 'id' | 'created_at' | 'updated_at'>>): Feed;
    deleteFeed(id: string): void;
    close(): void;
}
//# sourceMappingURL=database.service.d.ts.map