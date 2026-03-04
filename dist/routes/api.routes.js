"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = apiRoutes;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const VALID_CATEGORIES = ['advisories', 'iocs', 'phishing', 'breaches', 'landscape', 'ddos', 'website_threats', 'research', 'news'];
function apiRoutes(feedService, dbService) {
    const router = (0, express_1.Router)();
    const validate = (req, res, next) => {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }
        next();
    };
    // GET /api/sources - list all configured feed sources
    router.get('/sources', async (_req, res, next) => {
        try {
            const feeds = await dbService.getAllFeeds();
            res.json(feeds);
        }
        catch (error) {
            next(error);
        }
    });
    // GET /api/feeds - fetch and return all feed articles
    router.get('/feeds', async (_req, res, next) => {
        try {
            const articles = await feedService.fetchAllFeeds();
            res.json(articles);
        }
        catch (error) {
            next(error);
        }
    });
    // GET /api/feeds/:sourceId - fetch articles for a specific source
    router.get('/feeds/:sourceId', [(0, express_validator_1.param)('sourceId').isString().trim().notEmpty()], validate, async (req, res, next) => {
        try {
            const articles = await feedService.fetchFeedBySource(req.params.sourceId);
            res.json(articles);
        }
        catch (error) {
            if (error?.message?.includes('not found')) {
                res.status(404).json({ error: error.message });
                return;
            }
            next(error);
        }
    });
    // GET /api/search?q=...&days=30&fuzzy=false
    router.get('/search', [
        (0, express_validator_1.query)('q').isString().trim().isLength({ min: 3 }).withMessage('Query must be at least 3 characters'),
        (0, express_validator_1.query)('days').optional().isInt({ min: 1 }).toInt(),
        (0, express_validator_1.query)('fuzzy').optional().isBoolean().toBoolean(),
    ], validate, async (req, res, next) => {
        try {
            const q = req.query.q;
            const days = req.query.days ? Number(req.query.days) : 30;
            const fuzzy = req.query.fuzzy === 'true';
            const results = await feedService.searchFeeds(q, days, fuzzy);
            res.json(results);
        }
        catch (error) {
            next(error);
        }
    });
    // GET /api/settings/feeds - list all feeds for settings page
    router.get('/settings/feeds', async (_req, res, next) => {
        try {
            const feeds = await dbService.getAllFeeds();
            res.json(feeds);
        }
        catch (error) {
            next(error);
        }
    });
    // POST /api/settings/feeds - create a new feed
    router.post('/settings/feeds', [
        (0, express_validator_1.body)('id').isString().trim().notEmpty().withMessage('ID is required'),
        (0, express_validator_1.body)('name').isString().trim().notEmpty().withMessage('Name is required'),
        (0, express_validator_1.body)('url').isURL().withMessage('Valid URL is required'),
        (0, express_validator_1.body)('type').isIn(['rss', 'json']).withMessage('Type must be rss or json'),
        (0, express_validator_1.body)('category').isIn(VALID_CATEGORIES).withMessage(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`),
        (0, express_validator_1.body)('parser').optional().isString(),
        (0, express_validator_1.body)('enabled').optional().isBoolean(),
    ], validate, async (req, res, next) => {
        try {
            const feed = await dbService.createFeed({
                id: req.body.id,
                name: req.body.name,
                url: req.body.url,
                type: req.body.type,
                category: req.body.category,
                parser: req.body.parser,
                enabled: req.body.enabled !== false,
            });
            res.status(201).json(feed);
        }
        catch (error) {
            if (error?.message?.includes('UNIQUE constraint')) {
                res.status(409).json({ error: `Feed with id '${req.body.id}' already exists` });
                return;
            }
            next(error);
        }
    });
    // PUT /api/settings/feeds/:feedId - update a feed
    router.put('/settings/feeds/:feedId', [
        (0, express_validator_1.param)('feedId').isString().trim().notEmpty(),
        (0, express_validator_1.body)('name').optional().isString().trim().notEmpty(),
        (0, express_validator_1.body)('url').optional().isURL(),
        (0, express_validator_1.body)('type').optional().isIn(['rss', 'json']),
        (0, express_validator_1.body)('category').optional().isIn(VALID_CATEGORIES),
        (0, express_validator_1.body)('parser').optional().isString(),
        (0, express_validator_1.body)('enabled').optional().isBoolean(),
    ], validate, async (req, res, next) => {
        try {
            const feed = await dbService.updateFeed(req.params.feedId, req.body);
            res.json(feed);
        }
        catch (error) {
            if (error?.message?.includes('not found')) {
                res.status(404).json({ error: error.message });
                return;
            }
            next(error);
        }
    });
    // DELETE /api/settings/feeds/:feedId - delete a feed
    router.delete('/settings/feeds/:feedId', [(0, express_validator_1.param)('feedId').isString().trim().notEmpty()], validate, async (req, res, next) => {
        try {
            await dbService.deleteFeed(req.params.feedId);
            res.status(204).send();
        }
        catch (error) {
            if (error?.message?.includes('not found')) {
                res.status(404).json({ error: error.message });
                return;
            }
            next(error);
        }
    });
    return router;
}
