"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedService = void 0;
const rss_parser_1 = __importDefault(require("rss-parser"));
const axios_1 = __importDefault(require("axios"));
const date_fns_1 = require("date-fns");
const logger_1 = require("../utils/logger");
const USER_AGENT = 'ThreatFeedAggregator/2.0 (+https://example.com)';
const REQUEST_TIMEOUT = 20000;
class FeedService {
    constructor(dbService) {
        this.dbService = dbService;
        this.rssParser = new rss_parser_1.default({
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
    async fetchAllFeeds() {
        const feeds = await this.dbService.getEnabledFeeds();
        const results = [];
        await Promise.allSettled(feeds.map(async (feed) => {
            try {
                const items = await this.fetchFeed(feed);
                const filtered = this.filterLast30Days(items);
                const enriched = filtered.map(item => this.enrichItem(item, feed));
                results.push(...enriched);
            }
            catch (error) {
                logger_1.logger.error(`Failed to fetch feed ${feed.name}:`, error);
            }
        }));
        if (results.length > 0) {
            await this.dbService.upsertArticles(results);
            await this.dbService.deleteOlderThan(30);
        }
        const stored = await this.dbService.fetchLatestArticles();
        return this.deduplicateAndSort([...results, ...stored]);
    }
    async fetchFeedBySource(sourceId) {
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
    async searchFeeds(query, days = 30, fuzzy = false) {
        const feeds = await this.dbService.getEnabledFeeds();
        const results = [];
        const queryLower = query.toLowerCase();
        await Promise.allSettled(feeds.map(async (feed) => {
            try {
                const items = await this.fetchFeed(feed);
                const filtered = this.filterLastNDays(items, days);
                for (const item of filtered) {
                    if (this.matchesQuery(item, queryLower, fuzzy)) {
                        results.push(this.enrichItem(item, feed));
                    }
                }
            }
            catch (error) {
                logger_1.logger.error(`Search failed for feed ${feed.name}:`, error);
            }
        }));
        const storedArticles = await this.dbService.fetchArticlesLastNDays(days);
        const matchingStored = storedArticles.filter(article => this.matchesQuery(article, queryLower, fuzzy));
        return this.deduplicateAndSort([...results, ...matchingStored]);
    }
    async fetchFeed(feed) {
        if (feed.type === 'rss') {
            return this.fetchRSSFeed(feed.url);
        }
        else if (feed.type === 'json') {
            return this.fetchJSONFeed(feed.url, feed.parser);
        }
        throw new Error(`Unsupported feed type: ${feed.type}`);
    }
    async fetchRSSFeed(url) {
        const feed = await this.rssParser.parseURL(url);
        return feed.items.map(entry => ({
            id: entry.id || entry.link || entry.guid || '',
            title: entry.title || 'Untitled',
            summary: entry.contentSnippet || entry.summary || entry.content || '',
            link: entry.link || '',
            published: entry.isoDate || entry.pubDate || new Date().toISOString()
        }));
    }
    async fetchJSONFeed(url, parser) {
        const response = await axios_1.default.get(url, {
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
                logger_1.logger.warn(`Unknown parser: ${parser}`);
                return [];
        }
    }
    parseCISAKEV(data) {
        if (!data.vulnerabilities || !Array.isArray(data.vulnerabilities)) {
            return [];
        }
        return data.vulnerabilities.map((vul) => ({
            id: vul.cveID || '',
            title: `${vul.cveID} - ${vul.vendorProject || ''}`,
            summary: vul.shortDescription || '',
            link: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
            published: vul.dateAdded || new Date().toISOString()
        }));
    }
    parseURLHaus(data) {
        if (!data.urls || !Array.isArray(data.urls)) {
            return [];
        }
        return data.urls.map((entry) => ({
            id: entry.id?.toString() || '',
            title: `Malware URL ${entry.url || ''}`,
            summary: entry.threat || '',
            link: entry.url || '',
            published: entry.date_added || new Date().toISOString()
        }));
    }
    parseAppleSecurityUpdates(data) {
        const entries = Array.isArray(data) ? data : (data.items || data.results || []);
        return entries.map((entry) => {
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
    parseAOSPSecurityBulletins(data) {
        let changes = [];
        if (typeof data === 'string' && data.startsWith(")]}'")) {
            const cleaned = data.substring(4);
            const parsed = JSON.parse(cleaned);
            changes = parsed.log || parsed;
        }
        else if (data.log) {
            changes = data.log;
        }
        else if (Array.isArray(data)) {
            changes = data;
        }
        return changes.map((change) => ({
            id: (change.id || change.commit)?.toString() || '',
            title: change.subject || change.message || 'Android Security Bulletin',
            summary: change.message || '',
            link: change.url || change.moreInfoUrl || '',
            published: change.updated || change.created || new Date().toISOString()
        }));
    }
    filterLast30Days(items) {
        return this.filterLastNDays(items, 30);
    }
    filterLastNDays(items, days) {
        const cutoff = (0, date_fns_1.subDays)(new Date(), days);
        return items.filter(item => {
            try {
                const publishedDate = this.normalizeDate(item.published);
                return publishedDate && (0, date_fns_1.isAfter)(publishedDate, cutoff);
            }
            catch {
                return false;
            }
        });
    }
    normalizeDate(dateStr) {
        if (!dateStr)
            return null;
        try {
            let parsed = (0, date_fns_1.parseISO)(dateStr);
            if (isNaN(parsed.getTime())) {
                parsed = new Date(dateStr);
            }
            if (isNaN(parsed.getTime())) {
                return null;
            }
            return parsed;
        }
        catch {
            return null;
        }
    }
    enrichItem(item, feed) {
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
    matchesQuery(item, query, fuzzy) {
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
    similarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) {
            return 1.0;
        }
        return (longer.length - this.editDistance(longer, shorter)) / longer.length;
    }
    editDistance(s1, s2) {
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                }
                else if (j > 0) {
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
    deduplicateAndSort(items) {
        const seen = new Set();
        const deduplicated = [];
        for (const item of items) {
            const key = item.link || item.id || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(item);
            }
        }
        return this.sortItems(deduplicated);
    }
    sortItems(items) {
        return items.sort((a, b) => {
            const dateA = this.normalizeDate(a.published);
            const dateB = this.normalizeDate(b.published);
            if (!dateA && !dateB)
                return 0;
            if (!dateA)
                return 1;
            if (!dateB)
                return -1;
            return dateB.getTime() - dateA.getTime();
        });
    }
}
exports.FeedService = FeedService;
