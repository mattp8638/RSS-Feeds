import Parser from 'rss-parser';
import axios, { AxiosResponse } from 'axios';
import { parseISO, subDays, isAfter } from 'date-fns';
import { DatabaseService, Article, Feed } from './database.service';
import { logger } from '../utils/logger';

const USER_AGENT = 'ThreatFeedAggregator/2.0 (+https://example.com)';
const REQUEST_TIMEOUT = 20000;

interface FeedItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  published: string;
}

export class FeedService {
  private rssParser: Parser;
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
    this.rssParser = new Parser({
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      customFields: {
        item: ['dc:date', 'pubDate', 'published', 'updated']
      }
    });
  }

  public async fetchAllFeeds(): Promise<Article[]> {
    const feeds = await this.dbService.getEnabledFeeds();
    const results: Article[] = [];

    await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const items = await this.fetchFeed(feed);
          const filtered = this.filterLast30Days(items);
          const enriched = filtered.map(item => this.enrichItem(item, feed));
          results.push(...enriched);
        } catch (error) {
          logger.error(`Failed to fetch feed ${feed.name}:`, error);
        }
      })
    );

    if (results.length > 0) {
      await this.dbService.upsertArticles(results);
      await this.dbService.deleteOlderThan(30);
    }

    const stored = await this.dbService.fetchLatestArticles();
    return this.deduplicateAndSort([...results, ...stored]);
  }

  public async fetchFeedBySource(sourceId: string): Promise<Article[]> {
    const feed = await this.dbService.getFeedById(sourceId);
    if (!feed) {
      throw new Error(`Feed with id '${sourceId}' not found`);
    }

    const cached = await this.dbService.fetchArticlesForSource(sourceId);
    
    if (cached.length > 0) {
      return this.sortItems(cached);
    }

    const items = await this.fetchFeed(feed);
    const filtered = this.filterLast30Days(items);
    const enriched = filtered.map(item => this.enrichItem(item, feed));

    if (enriched.length > 0) {
      await this.dbService.upsertArticles(enriched);
    }

    return this.sortItems(enriched);
  }

  public async searchFeeds(query: string, days: number = 30, fuzzy: boolean = false): Promise<Article[]> {
    const feeds = await this.dbService.getEnabledFeeds();
    const results: Article[] = [];
    const queryLower = query.toLowerCase();

    await Promise.allSettled(
      feeds.map(async (feed) => {
        try {
          const items = await this.fetchFeed(feed);
          const filtered = this.filterLastNDays(items, days);

          for (const item of filtered) {
            if (this.matchesQuery(item, queryLower, fuzzy)) {
              results.push(this.enrichItem(item, feed));
            }
          }
        } catch (error) {
          logger.error(`Search failed for feed ${feed.name}:`, error);
        }
      })
    );

    const storedArticles = await this.dbService.fetchArticlesLastNDays(days);
    const matchingStored = storedArticles.filter(article =>
      this.matchesQuery(article, queryLower, fuzzy)
    );

    return this.deduplicateAndSort([...results, ...matchingStored]);
  }

  private async fetchFeed(feed: Feed): Promise<FeedItem[]> {
    if (feed.type === 'rss') {
      return this.fetchRSSFeed(feed.url);
    } else if (feed.type === 'json') {
      return this.fetchJSONFeed(feed.url, feed.parser);
    }
    throw new Error(`Unsupported feed type: ${feed.type}`);
  }

  private async fetchRSSFeed(url: string): Promise<FeedItem[]> {
    const feed = await this.rssParser.parseURL(url);
    
    return feed.items.map(entry => ({
      id: entry.id || entry.link || entry.guid || '',
      title: entry.title || 'Untitled',
      summary: entry.contentSnippet || entry.summary || entry.content || '',
      link: entry.link || '',
      published: entry.isoDate || entry.pubDate || new Date().toISOString()
    }));
  }

  private async fetchJSONFeed(url: string, parser?: string): Promise<FeedItem[]> {
    const response: AxiosResponse = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: REQUEST_TIMEOUT
    });

    if (!parser) {
      return [];
    }

    switch (parser) {
      case 'cisa_kev':
        return this.parseCISAKEV(response.data);
      case 'urlhaus_recent':
        return this.parseURLHaus(response.data);
      case 'apple_security_updates':
        return this.parseAppleSecurityUpdates(response.data);
      case 'aosp_security_bulletins':
        return this.parseAOSPSecurityBulletins(response.data);
      default:
        logger.warn(`Unknown parser: ${parser}`);
        return [];
    }
  }

  private parseCISAKEV(data: any): FeedItem[] {
    if (!data.vulnerabilities || !Array.isArray(data.vulnerabilities)) {
      return [];
    }

    return data.vulnerabilities.map((vul: any) => ({
      id: vul.cveID || '',
      title: `${vul.cveID} - ${vul.vendorProject || ''}`,
      summary: vul.shortDescription || '',
      link: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
      published: vul.dateAdded || new Date().toISOString()
    }));
  }

  private parseURLHaus(data: any): FeedItem[] {
    if (!data.urls || !Array.isArray(data.urls)) {
      return [];
    }

    return data.urls.map((entry: any) => ({
      id: entry.id?.toString() || '',
      title: `Malware URL ${entry.url || ''}`,
      summary: entry.threat || '',
      link: entry.url || '',
      published: entry.date_added || new Date().toISOString()
    }));
  }

  private parseAppleSecurityUpdates(data: any): FeedItem[] {
    const entries = Array.isArray(data) ? data : (data.items || data.results || []);
    
    return entries.map((entry: any) => {
      const record = entry.attributes || entry;
      return {
        id: (record.id || entry.id || record.title)?.toString() || '',
        title: record.title || record.name || 'Apple Security Update',
        summary: record.description || record.summary || '',
        link: record.link || record.url || 'https://support.apple.com/en-us/HT201222',
        published: record.date || record.publishedDate || new Date().toISOString()
      };
    });
  }

  private parseAOSPSecurityBulletins(data: any): FeedItem[] {
    let changes = [];
    
    if (typeof data === 'string' && data.startsWith(")]}'")) {
      const cleaned = data.substring(4);
      const parsed = JSON.parse(cleaned);
      changes = parsed.log || parsed;
    } else if (data.log) {
      changes = data.log;
    } else if (Array.isArray(data)) {
      changes = data;
    }

    return changes.map((change: any) => ({
      id: (change.id || change.commit)?.toString() || '',
      title: change.subject || change.message || 'Android Security Bulletin',
      summary: change.message || '',
      link: change.url || change.moreInfoUrl || '',
      published: change.updated || change.created || new Date().toISOString()
    }));
  }

  private filterLast30Days(items: FeedItem[]): FeedItem[] {
    return this.filterLastNDays(items, 30);
  }

  private filterLastNDays(items: FeedItem[], days: number): FeedItem[] {
    const cutoff = subDays(new Date(), days);

    return items.filter(item => {
      try {
        const publishedDate = this.normalizeDate(item.published);
        return publishedDate && isAfter(publishedDate, cutoff);
      } catch {
        return false;
      }
    });
  }

  private normalizeDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    try {
      let parsed = parseISO(dateStr);
      if (isNaN(parsed.getTime())) {
        parsed = new Date(dateStr);
      }
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private enrichItem(item: FeedItem, feed: Feed): Article {
    return {
      id: item.id,
      title: item.title,
      summary: item.summary,
      link: item.link,
      published: item.published,
      source: feed.name,
      category: feed.category,
      source_id: feed.id,
      created_at: new Date().toISOString()
    };
  }

  private matchesQuery(item: FeedItem | Article, query: string, fuzzy: boolean): boolean {
    const haystack = `${item.title} ${item.summary}`.toLowerCase();

    if (haystack.includes(query)) {
      return true;
    }

    if (fuzzy) {
      const words = haystack.split(/\s+/);
      return words.some(word => this.similarity(query, word) >= 0.6);
    }

    return false;
  }

  private similarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) {
      return 1.0;
    }

    return (longer.length - this.editDistance(longer, shorter)) / longer.length;
  }

  private editDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }
    return costs[s2.length];
  }

  private deduplicateAndSort(items: Article[]): Article[] {
    const seen = new Set<string>();
    const deduplicated: Article[] = [];

    for (const item of items) {
      const key = item.link || item.id || item.title;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    return this.sortItems(deduplicated);
  }

  private sortItems(items: Article[]): Article[] {
    return items.sort((a, b) => {
      const dateA = this.normalizeDate(a.published);
      const dateB = this.normalizeDate(b.published);
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      return dateB.getTime() - dateA.getTime();
    });
  }
}
