import { Hono } from 'hono';
import { authGuard, authRoutes, requireUser, type AppEnv } from './auth';
import { cardsRoutes } from './routes/cards';
import { collectionRoutes } from './routes/collection';
import { decksRoutes } from './routes/decks';
import { activationRoutes } from './routes/activation';
import { syncRoutes } from './routes/sync';
import { friendsRoutes } from './routes/friends';
import { loansRoutes } from './routes/loans';

const app = new Hono<AppEnv>();

// Health check (public).
app.get('/api/health', (c) => c.json({ ok: true }));

// Public auth (setup-status, bootstrap, register, login; /me uses its own guard).
app.route('/api/auth', authRoutes);

// Everything else under /api requires a valid JWT + resolved user.
const api = new Hono<AppEnv>();
api.use('*', authGuard, requireUser);
api.route('/', cardsRoutes); // /cards, /cards/:id, /sets, /source-titles, /traits, /status
api.route('/collection', collectionRoutes);
api.route('/', activationRoutes); // /decks/:id/activate|activation-plan|deactivate, /locations
api.route('/decks', decksRoutes); // CRUD: /, /:id, /:id/cards
api.route('/friends', friendsRoutes);
api.route('/loans', loansRoutes);
api.route('/admin', syncRoutes);
app.route('/api', api);

// Unknown API routes -> JSON 404 (SPA fallback is handled by the assets binding).
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
