"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = apiRoutes;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
function apiRoutes(feedService) {
    const router = (0, express_1.Router)();
    const validate = (req, res, next) => {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }
        next();
    };
    router.get('/sources', async (_req, res, next) => {
        try {
            const feeds = feedService['dbService'].getAllFeeds();
            res.json(feeds);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/feeds', async (_req, res, next) => {
        try {
            const articles = await feedService.fetchAllFeeds();
            res.json(articles);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/feeds/:sourceId', (0, express_validator_1.param)('sourceId').isString().trim().notEmpty(), validate, async (req, res, next) => {
        try {
            const articles = await feedService.fetchFeedBySource(req.params.sourceId);
            res.json(articles);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/search', [
        (0, express_validator_1.query)('q').isString().trim().isLength({ min: 3 }),
        (0, express_validator_1.query)('days').optional().isInt({ min: 1 }).toInt(),
        (0, express_validator_1.query)('fuzzy').optional().isBoolean().toBoolean(),
    ], validate, async (req, res, next) => {
        try {
            const query = req.query.q;
            const days = req.query.days ? parseInt(req.query.days, 10) : 30;
            const fuzzy = req.query.fuzzy === 'true';
            const results = await feedService.searchFeeds(query, days, fuzzy);
            res.json(results);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/settings/feeds', async (_req, res, next) => {
        try {
            const feeds = feedService['dbService'].getAllFeeds();
            res.json(feeds);
        }
        catch (error) {
            next(error);
        }
    });
    router.post('/settings/feeds', [
        (0, express_validator_1.body)('id').isString().trim().notEmpty(),
        (0, express_validator_1.body)('name').isString().trim().notEmpty(),
        (0, express_validator_1.body)('url').isURL(),
        (0, express_validator_1.body)('type').isString().isIn(['rss', 'json']),
        (0, express_validator_1.body)('category').isString().isIn(['advisories', 'iocs', 'research']),
        (0, express_validator_1.body)('parser').optional().isString(),
        (0, express_validator_1.body)('enabled').optional().isBoolean(),
    ], validate, async (req, res, next) => {
        try {
            const feed = feedService['dbService'].createFeed({
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
            next(error);
        }
    });
    router.put('/settings/feeds/:feedId', [
        (0, express_validator_1.param)('feedId').isString().trim().notEmpty(),
        (0, express_validator_1.body)('name').optional().isString().trim().notEmpty(),
        (0, express_validator_1.body)('url').optional().isURL(),
        (0, express_validator_1.body)('type').optional().isString().isIn(['rss', 'json']),
        (0, express_validator_1.body)('category').optional().isString().isIn(['advisories', 'iocs', 'research']),
        (0, express_validator_1.body)('parser').optional().isString(),
        (0, express_validator_1.body)('enabled').optional().isBoolean(),
    ], validate, async (req, res, next) => {
        try {
            const feed = feedService['dbService'].updateFeed(req.params.feedId, req.body);
            res.json(feed);
        }
        catch (error) {
            next(error);
        }
    });
    router.delete('/settings/feeds/:feedId', (0, express_validator_1.param)('feedId').isString().trim().notEmpty(), validate, async (req, res, next) => {
        try {
            feedService['dbService'].deleteFeed(req.params.feedId);
            res.status(204).send();
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
//# sourceMappingURL=api.routes.js.map