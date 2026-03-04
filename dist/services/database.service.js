"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
class DatabaseService {
    constructor(databaseUrl) {
        this.pool = null;
        this.databaseUrl = databaseUrl || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/threat_feed';
    }
    async initialize() {
        try {
            this.pool = new pg_1.Pool({
                connectionString: this.databaseUrl,
                ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
            });
            await this.pool.query('SELECT 1');
            await this.createTables();
            await this.initializeDefaultFeeds();
            logger_1.logger.info('Database initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Database initialization failed:', error);
            throw error;
        }
    }
    async createTables() {
        if (!this.pool)
            throw new Error('Database not initialized');
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        link TEXT,
        published TEXT NOT NULL,
        source TEXT NOT NULL,
        category TEXT NOT NULL,
        source_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);
      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);

      CREATE TABLE IF NOT EXISTS feeds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'rss',
        category TEXT NOT NULL,
        parser TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category);
      CREATE INDEX IF NOT EXISTS idx_feeds_enabled ON feeds(enabled);
    `);
    }
    async initializeDefaultFeeds() {
        if (!this.pool)
            throw new Error('Database not initialized');
        const defaultFeeds = [
            // Critical Infrastructure & Government Advisories
            {
                id: 'cisa_kev',
                name: 'CISA Known Exploited Vulnerabilities',
                url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
                type: 'json',
                category: 'advisories',
                parser: 'cisa_kev',
                enabled: true
            },
            {
                id: 'uscert_ics',
                name: 'US-CERT ICS Advisories',
                url: 'https://www.cisa.gov/ics/advisories/advisories.xml',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: 'uscert_alerts',
                name: 'US-CERT Alerts',
                url: 'https://www.cisa.gov/ncas/alerts.xml',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: 'uscert_analysis',
                name: 'US-CERT Analysis Reports',
                url: 'https://www.cisa.gov/ncas/analysis-reports.xml',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: 'uscert_current',
                name: 'US-CERT Current Activity',
                url: 'https://www.cisa.gov/ncas/current-activity.xml',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: 'nist_nvd',
                name: 'NIST NVD Recent Vulnerabilities',
                url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            // Vendor Security Advisories
            {
                id: 'msrc_updates',
                name: 'Microsoft MSRC Security Updates',
                url: 'https://api.msrc.microsoft.com/update-guide/rss',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: 'android_bulletins',
                name: 'Android Security Bulletins',
                url: 'https://feeds.feedburner.com/GoogleOnlineSecurityBlog',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: '0patch_blog',
                name: '0patch Blog',
                url: 'https://blog.0patch.com/feeds/posts/default',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            {
                id: 'exploit_one',
                name: 'Exploit One',
                url: 'https://exploitone.com/feed',
                type: 'rss',
                category: 'advisories',
                enabled: true
            },
            // Indicators of Compromise (IOCs)
            {
                id: 'urlhaus',
                name: 'URLhaus Recent URLs',
                url: 'https://urlhaus.abuse.ch/downloads/json_recent/',
                type: 'json',
                category: 'iocs',
                parser: 'urlhaus_recent',
                enabled: true
            },
            // Phishing Intelligence
            {
                id: 'phishlabs_blog',
                name: 'PhishLabs Blog',
                url: 'http://blog.phishlabs.com/rss.xml',
                type: 'rss',
                category: 'phishing',
                enabled: true
            },
            // Data Breaches
            {
                id: 'upguard_news',
                name: 'UpGuard News',
                url: 'https://www.upguard.com/news/rss.xml',
                type: 'rss',
                category: 'breaches',
                enabled: true
            },
            {
                id: 'upguard_breaches',
                name: 'UpGuard Breaches',
                url: 'https://www.upguard.com/breaches/rss.xml',
                type: 'rss',
                category: 'breaches',
                enabled: true
            },
            // Threat Landscape & Intelligence
            {
                id: 'sans_isc',
                name: 'SANS Internet Storm Center',
                url: 'https://isc.sans.edu/rssfeed_full.xml',
                type: 'rss',
                category: 'landscape',
                enabled: true
            },
            // DDoS Threats
            {
                id: 'mazebolt_blog',
                name: 'MazeBolt Blog',
                url: 'https://mazebolt.com/feed',
                type: 'rss',
                category: 'ddos',
                enabled: true
            },
            // Web Application Security
            {
                id: 'cloudflare_security',
                name: 'Cloudflare Security',
                url: 'https://blog.cloudflare.com/tag/security/rss',
                type: 'rss',
                category: 'website_threats',
                enabled: true
            },
            {
                id: 'imperva_blog',
                name: 'Imperva Blog',
                url: 'https://www.imperva.com/blog/feed',
                type: 'rss',
                category: 'website_threats',
                enabled: true
            },
            {
                id: 'wallarm_lab',
                name: 'Wallarm Lab',
                url: 'https://lab.wallarm.com/feed',
                type: 'rss',
                category: 'website_threats',
                enabled: true
            },
            {
                id: 'acunetix_blog',
                name: 'Acunetix Web Security Blog',
                url: 'https://www.acunetix.com/blog/feed',
                type: 'rss',
                category: 'website_threats',
                enabled: true
            },
            {
                id: 'cloudbric_blog',
                name: 'Cloudbric Blog',
                url: 'https://www.cloudbric.com/feed',
                type: 'rss',
                category: 'website_threats',
                enabled: true
            },
            {
                id: 'secureblink_threatspy',
                name: 'Secureblink ThreatSpy',
                url: 'https://secureblink.com/rss-feeds/threatspy.xml',
                type: 'rss',
                category: 'website_threats',
                enabled: true
            },
            // Threat Research & Intelligence - Tech Giants
            {
                id: 'microsoft_threat_intel',
                name: 'Microsoft Security Blog',
                url: 'https://www.microsoft.com/en-us/security/blog/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'msrc_blog',
                name: 'MSRC Blog',
                url: 'https://msrc-blog.microsoft.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'google_security',
                name: 'Google Security Blog',
                url: 'https://security.googleblog.com/feeds/posts/default',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'project_zero',
                name: 'Google Project Zero',
                url: 'https://googleprojectzero.blogspot.com/feeds/posts/default',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Security Vendors (Enterprise EDR/XDR)
            {
                id: 'crowdstrike_blog',
                name: 'CrowdStrike Blog',
                url: 'https://www.crowdstrike.com/en-us/blog/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'crowdstrike_threat_intel',
                name: 'CrowdStrike Threat Intel & Research',
                url: 'https://www.crowdstrike.com/blog/category/threat-intel-research/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'sentinelone_labs',
                name: 'SentinelOne Labs',
                url: 'https://www.sentinelone.com/labs/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'paloalto_blog',
                name: 'Palo Alto Networks Blog',
                url: 'https://www.paloaltonetworks.com/blog/rss',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'unit42',
                name: 'Palo Alto Networks Unit 42',
                url: 'http://researchcenter.paloaltonetworks.com/unit42/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Security Vendors (AV/EPP)
            {
                id: 'securelist',
                name: 'Kaspersky Securelist',
                url: 'https://securelist.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'welivesecurity',
                name: 'ESET WeLiveSecurity',
                url: 'https://www.welivesecurity.com/en/rss/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'malwarebytes_labs',
                name: 'Malwarebytes Labs',
                url: 'https://blog.malwarebytes.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'bitdefender_labs',
                name: 'Bitdefender Labs',
                url: 'https://www.bitdefender.com/blog/api/rss/labs/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'trendmicro_simply_security',
                name: 'Trend Micro Simply Security',
                url: 'https://feeds.trendmicro.com/TrendMicroSimplySecurity',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'mcafee_blogs',
                name: 'McAfee Blogs',
                url: 'https://www.mcafee.com/blogs/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'naked_security',
                name: 'Sophos Naked Security',
                url: 'https://nakedsecurity.sophos.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Network Security
            {
                id: 'cisco_security',
                name: 'Cisco Security Blog',
                url: 'https://blogs.cisco.com/security/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'cisco_talos',
                name: 'Cisco Talos Intelligence',
                url: 'http://feeds.feedburner.com/feedburner/Talos',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'checkpoint_research',
                name: 'Check Point Research',
                url: 'https://research.checkpoint.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'fortinet_threat_research',
                name: 'Fortinet Threat Research',
                url: 'http://feeds.feedburner.com/fortinet/blog/threat-research',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Email/Cloud Security
            {
                id: 'proofpoint_threat_insight',
                name: 'Proofpoint Threat Insight',
                url: 'https://www.proofpoint.com/us/rss.xml',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - MDR/MSSP
            {
                id: 'secureworks_research',
                name: 'SecureWorks Research & Intelligence',
                url: 'https://www.secureworks.com/rss?feed=blog&category=research-intelligence',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'att_cybersecurity',
                name: 'AT&T Cybersecurity Blog',
                url: 'https://cybersecurity.att.com/site/blog-all-rss',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Threat Intelligence Platforms
            {
                id: 'anomali_blog',
                name: 'Anomali Blog',
                url: 'https://www.anomali.com/site/blog-rss',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'eclecticiq_blog',
                name: 'EclecticIQ Blog',
                url: 'https://blog.eclecticiq.com/rss.xml',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'digital_shadows',
                name: 'Digital Shadows Blog',
                url: 'https://www.digitalshadows.com/blog-and-research/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Incident Response
            {
                id: 'fireeye_blog',
                name: 'FireEye / Trellix Blog',
                url: 'http://www.fireeye.com/blog/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Vulnerability Management
            {
                id: 'qualys_blog',
                name: 'Qualys Blog',
                url: 'https://blog.qualys.com/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'tripwire_state_of_security',
                name: 'Tripwire State of Security',
                url: 'https://www.tripwire.com/state-of-security/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - AppSec
            {
                id: 'veracode_blog',
                name: 'Veracode Blog',
                url: 'http://www.veracode.com/blog/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Enterprise IT Security
            {
                id: 'ibm_security_intel',
                name: 'IBM Security Intelligence',
                url: 'https://securityintelligence.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Specialized Labs
            {
                id: 'foxit_blog',
                name: 'Fox-IT Blog',
                url: 'https://blog.fox-it.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'quarkslab_blog',
                name: 'Quarkslab Blog',
                url: 'https://blog.quarkslab.com/feeds/all.rss.xml',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'sensepost_blog',
                name: 'SensePost Blog',
                url: 'https://sensepost.com/rss.xml',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'specterops_posts',
                name: 'SpecterOps Posts',
                url: 'https://posts.specterops.io/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Detection Engineering
            {
                id: 'socprime_blog',
                name: 'SOC Prime Blog',
                url: 'https://socprime.com/blog/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Sandbox/Analysis
            {
                id: 'anyrun_blog',
                name: 'ANY.RUN Cybersecurity Blog',
                url: 'https://any.run/cybersecurity-blog/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'virustotal_blog',
                name: 'VirusTotal Blog',
                url: 'https://blog.virustotal.com/feeds/posts/default',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Independent/Academic
            {
                id: 'nist_cyber_insights',
                name: 'NIST Cybersecurity Insights',
                url: 'https://www.nist.gov/blogs/cybersecurity-insights/rss.xml',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'malware_traffic_analysis',
                name: 'Malware Traffic Analysis Blog',
                url: 'http://www.malware-traffic-analysis.net/blog-entries.rss',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'virus_bulletin',
                name: 'Virus Bulletin',
                url: 'https://www.virusbulletin.com/rss',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            {
                id: 'hackmageddon',
                name: 'HACKMAGEDDON',
                url: 'https://www.hackmageddon.com/feed/',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Threat Research - Miscellaneous
            {
                id: 'webroot_blog',
                name: 'Webroot Blog',
                url: 'https://www.webroot.com/blog/feed',
                type: 'rss',
                category: 'research',
                enabled: true
            },
            // Security News - Premium Sources
            {
                id: 'krebsonsecurity',
                name: 'Krebs on Security',
                url: 'https://krebsonsecurity.com/feed',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'the_hacker_news',
                name: 'The Hacker News',
                url: 'https://feeds.feedburner.com/TheHackersNews',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'bleepingcomputer',
                name: 'BleepingComputer',
                url: 'https://www.bleepingcomputer.com/feed/',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'threatpost',
                name: 'Threatpost',
                url: 'https://threatpost.com/feed/',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'darkreading',
                name: 'Dark Reading',
                url: 'https://www.darkreading.com/rss/all.xml',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            // Security News - Mainstream Tech Media
            {
                id: 'wired_security',
                name: 'WIRED Security',
                url: 'https://www.wired.com/feed/category/security/latest/rss',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'zdnet_security',
                name: 'ZDNet Security',
                url: 'https://www.zdnet.com/topic/security/rss.xml',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'guardian_security',
                name: 'The Guardian Data & Computer Security',
                url: 'https://www.theguardian.com/technology/data-computer-security/rss',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            // Security News - Industry Publications
            {
                id: 'infosecurity_mag',
                name: 'Infosecurity Magazine News',
                url: 'https://www.infosecurity-magazine.com/rss/news/',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'cyber_defense_mag',
                name: 'Cyber Defense Magazine',
                url: 'https://www.cyberdefensemagazine.com/feed/',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            // Security News - Independent Researchers
            {
                id: 'graham_cluley',
                name: 'Graham Cluley',
                url: 'https://www.grahamcluley.com/feed',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            // Security News - General
            {
                id: 'hackread',
                name: 'HackRead',
                url: 'https://www.hackread.com/feed/',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'security_affairs',
                name: 'Security Affairs',
                url: 'http://securityaffairs.co/wordpress/feed',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'helpnetsecurity',
                name: 'Help Net Security',
                url: 'https://www.helpnetsecurity.com/feed/',
                type: 'rss',
                category: 'news',
                enabled: true
            },
            {
                id: 'gbhackers',
                name: 'GBHackers on Security',
                url: 'https://gbhackers.com/feed/',
                type: 'rss',
                category: 'news',
                enabled: true
            }
        ];
        for (const feed of defaultFeeds) {
            await this.pool.query(`
      INSERT INTO feeds (id, name, url, type, category, parser, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
      `, [feed.id, feed.name, feed.url, feed.type, feed.category, feed.parser || null, feed.enabled]);
        }
        const knownUnavailableFeedIds = [
            'digital_shadows',
            'darkreading',
            'cyber_defense_mag',
            'fortinet_threat_research',
            'att_cybersecurity',
            'trendmicro_simply_security',
            'secureblink_threatspy',
            'fireeye_blog',
            'msrc_blog',
            'anyrun_blog',
            'anomali_blog',
            'ibm_security_intel',
            'unit42',
            'secureworks_research',
            'specterops_posts',
            'naked_security',
            'crowdstrike_threat_intel',
            'phishlabs_blog',
            'mcafee_blogs',
            'imperva_blog',
            'cloudbric_blog'
        ];
        if (knownUnavailableFeedIds.length > 0) {
            await this.pool.query('UPDATE feeds SET enabled = FALSE, updated_at = NOW() WHERE id = ANY($1::text[])', [knownUnavailableFeedIds]);
        }
    }
    async upsertArticles(articles) {
        if (!this.pool)
            throw new Error('Database not initialized');
        if (articles.length === 0)
            return;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const article of articles) {
                await client.query(`
          INSERT INTO articles (id, title, summary, link, published, source, category, source_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id)
          DO UPDATE SET
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            link = EXCLUDED.link,
            published = EXCLUDED.published,
            source = EXCLUDED.source,
            category = EXCLUDED.category,
            source_id = EXCLUDED.source_id,
            created_at = NOW()
          `, [
                    article.id,
                    article.title,
                    article.summary,
                    article.link,
                    article.published,
                    article.source,
                    article.category,
                    article.source_id,
                ]);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async fetchLatestArticles(limit = 1000) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const { rows } = await this.pool.query(`
      SELECT id, title, summary, link, published, source, category, source_id, created_at
      FROM articles
      ORDER BY created_at DESC
      LIMIT $1
      `, [limit]);
        return rows;
    }
    async fetchArticlesForSource(sourceId) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const { rows } = await this.pool.query(`
      SELECT id, title, summary, link, published, source, category, source_id, created_at
      FROM articles
      WHERE source_id = $1
      ORDER BY created_at DESC
      `, [sourceId]);
        return rows;
    }
    async fetchArticlesLastNDays(days) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const { rows } = await this.pool.query(`
      SELECT id, title, summary, link, published, source, category, source_id, created_at
      FROM articles
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
      ORDER BY created_at DESC
      `, [days]);
        return rows;
    }
    async deleteOlderThan(days) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const result = await this.pool.query(`
      DELETE FROM articles
      WHERE created_at < NOW() - ($1::text || ' days')::interval
      `, [days]);
        logger_1.logger.info(`Deleted ${result.rowCount ?? 0} old articles (older than ${days} days)`);
    }
    async getAllFeeds() {
        if (!this.pool)
            throw new Error('Database not initialized');
        const { rows } = await this.pool.query('SELECT * FROM feeds ORDER BY name');
        return rows;
    }
    async getEnabledFeeds() {
        if (!this.pool)
            throw new Error('Database not initialized');
        const { rows } = await this.pool.query('SELECT * FROM feeds WHERE enabled = TRUE ORDER BY name');
        return rows;
    }
    async getFeedById(id) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const { rows } = await this.pool.query('SELECT * FROM feeds WHERE id = $1', [id]);
        return rows[0];
    }
    async createFeed(feed) {
        if (!this.pool)
            throw new Error('Database not initialized');
        await this.pool.query(`
      INSERT INTO feeds (id, name, url, type, category, parser, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [feed.id, feed.name, feed.url, feed.type, feed.category, feed.parser || null, feed.enabled]);
        const created = await this.getFeedById(feed.id);
        if (!created)
            throw new Error('Failed to create feed');
        return created;
    }
    async updateFeed(id, updates) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const existing = await this.getFeedById(id);
        if (!existing)
            throw new Error(`Feed with id '${id}' not found`);
        await this.pool.query(`
      UPDATE feeds
      SET name = $1, url = $2, type = $3, category = $4, parser = $5, enabled = $6, updated_at = NOW()
      WHERE id = $7
      `, [
            updates.name ?? existing.name,
            updates.url ?? existing.url,
            updates.type ?? existing.type,
            updates.category ?? existing.category,
            updates.parser ?? existing.parser,
            updates.enabled !== undefined ? updates.enabled : existing.enabled,
            id,
        ]);
        const updated = await this.getFeedById(id);
        if (!updated)
            throw new Error('Failed to update feed');
        return updated;
    }
    async deleteFeed(id) {
        if (!this.pool)
            throw new Error('Database not initialized');
        const result = await this.pool.query('DELETE FROM feeds WHERE id = $1', [id]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`Feed with id '${id}' not found`);
        }
    }
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            logger_1.logger.info('Database connection closed');
        }
    }
}
exports.DatabaseService = DatabaseService;
