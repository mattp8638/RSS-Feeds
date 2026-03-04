import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { FeedService } from '../services/feed.service';
import { DatabaseService } from '../services/database.service';

const VALID_CATEGORIES = ['advisories', 'iocs', 'phishing', 'breaches', 'landscape', 'ddos', 'website_threats', 'research', 'news'];

export default function apiRoutes(feedService: FeedService, dbService: DatabaseService): Router {
  const router = Router();

  const validate = (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    next();
  };

  // GET /api/sources - list all configured feed sources
  router.get('/sources', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feeds = await dbService.getAllFeeds();
      res.json(feeds);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/feeds - fetch and return all feed articles
  router.get('/feeds', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const articles = await feedService.fetchAllFeeds();
      res.json(articles);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/feeds/:sourceId - fetch articles for a specific source
  router.get(
    '/feeds/:sourceId',
    [param('sourceId').isString().trim().notEmpty()],
    validate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const articles = await feedService.fetchFeedBySource(req.params.sourceId);
        res.json(articles);
      } catch (error: any) {
        if (error?.message?.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        next(error);
      }
    }
  );

  // GET /api/search?q=...&days=30&fuzzy=false
  router.get(
    '/search',
    [
      query('q').isString().trim().isLength({ min: 3 }).withMessage('Query must be at least 3 characters'),
      query('days').optional().isInt({ min: 1 }).toInt(),
      query('fuzzy').optional().isBoolean().toBoolean(),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const q = req.query.q as string;
        const days = req.query.days ? Number(req.query.days) : 30;
        const fuzzy = req.query.fuzzy === 'true';

        const results = await feedService.searchFeeds(q, days, fuzzy);
        res.json(results);
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/settings/feeds - list all feeds for settings page
  router.get('/settings/feeds', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feeds = await dbService.getAllFeeds();
      res.json(feeds);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/settings/feeds - create a new feed
  router.post(
    '/settings/feeds',
    [
      body('id').isString().trim().notEmpty().withMessage('ID is required'),
      body('name').isString().trim().notEmpty().withMessage('Name is required'),
      body('url').isURL().withMessage('Valid URL is required'),
      body('type').isIn(['rss', 'json']).withMessage('Type must be rss or json'),
      body('category').isIn(VALID_CATEGORIES).withMessage(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`),
      body('parser').optional().isString(),
      body('enabled').optional().isBoolean(),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      } catch (error: any) {
        if (error?.message?.includes('UNIQUE constraint')) {
          res.status(409).json({ error: `Feed with id '${req.body.id}' already exists` });
          return;
        }
        next(error);
      }
    }
  );

  // PUT /api/settings/feeds/:feedId - update a feed
  router.put(
    '/settings/feeds/:feedId',
    [
      param('feedId').isString().trim().notEmpty(),
      body('name').optional().isString().trim().notEmpty(),
      body('url').optional().isURL(),
      body('type').optional().isIn(['rss', 'json']),
      body('category').optional().isIn(VALID_CATEGORIES),
      body('parser').optional().isString(),
      body('enabled').optional().isBoolean(),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const feed = await dbService.updateFeed(req.params.feedId, req.body);
        res.json(feed);
      } catch (error: any) {
        if (error?.message?.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        next(error);
      }
    }
  );

  // DELETE /api/settings/feeds/:feedId - delete a feed
  router.delete(
    '/settings/feeds/:feedId',
    [param('feedId').isString().trim().notEmpty()],
    validate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await dbService.deleteFeed(req.params.feedId);
        res.status(204).send();
      } catch (error: any) {
        if (error?.message?.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        next(error);
      }
    }
  );

  return router;
}
