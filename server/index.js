require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const jwt       = require('jsonwebtoken');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const db        = require('./database');
const webpush   = require('web-push');
webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

// Envoyer une push notification à un user (silencieux si erreur)
async function sendPush(userId, title, body, url) {
  try {
    const { Pool } = require('pg');
    const subs = await db.pool ? db.pool.query('SELECT * FROM push_subscriptions WHERE user_id=$1', [userId]) : null;
    if (!subs || !subs.rows.length) return;
    const payload = JSON.stringify({ title, body, url: url || '/' });
    for (const s of subs.rows) {
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        .catch(() => {});
    }
  } catch(e) {}
}

const app        = express();
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const VIDEO_TTL  = parseInt(process.env.VIDEO_TOKEN_TTL) || 7200;
const IS_PROD    = process.env.NODE_ENV === 'production';
// Limite : 10 tentatives par IP toutes les 15 minutes sur les routes auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TROP_DE_TENTATIVES' }
});
// Validation du secret JWT au démarrage
// Le serveur refuse de démarrer si le secret est absent ou trop court
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('\n[ERREUR FATALE] JWT_SECRET absent ou trop court (minimum 32 caractères).');
  console.error('Ajoutez JWT_SECRET dans votre fichier .env');
  console.error('Générez un secret fort avec : node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n');
  process.exit(1);
}
// Origines autorisées : lues depuis .env, ou localhost en dév
// L'IP locale du réseau (ex: 192.168.x.x) est ajoutée automatiquement
const os = require('os');
const localIP = Object.values(os.networkInterfaces()).flat()
  .find(i => i.family === 'IPv4' && !i.internal)?.address || null;
const BASE_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3001', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://127.0.0.1:3001'];
const ALLOWED_ORIGINS = localIP
  ? [...new Set([...BASE_ORIGINS, `http://${localIP}:${process.env.PORT || 3001}`])]
  : BASE_ORIGINS;
const corsOptions = {
  origin: (origin, cb) => {
    // Autoriser les requêtes sans origine (Postman, curl, appels serveur-à-serveur)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // En dév, logger l'origine refusée pour faciliter le debug
    if (!IS_PROD) console.warn('[CORS] Origine refusée :', origin);
    cb(new Error('CORS_ORIGIN_NON_AUTORISEE'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
const localIPForCSP = localIP ? `http://${localIP}:${process.env.PORT || 3001}` : null;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://www.youtube.com", "https://s.ytimg.com"],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc:        ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc:         ["'self'", "data:", "blob:", "https:"],
      frameSrc:       ["https://www.youtube.com", "https://drive.google.com"],
      connectSrc:     ["'self'", "http://localhost:3001", "http://127.0.0.1:3001", "https://pagani-digital.onrender.com", ...(localIPForCSP ? [localIPForCSP] : [])],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
    }
  },
  hsts: false,
}));

// Remplacer le CSP de helmet par un CSP sans upgrade-insecure-requests
app.use((req, res, next) => {
  const ip = localIP ? `http://${localIP}:${process.env.PORT || 3001}` : null;
  const connectSrc = ["'self'", "http://localhost:3001", "http://127.0.0.1:3001", "https://pagani-digital.onrender.com", ...(ip ? [ip] : [])].join(' ');
  res.setHeader('Content-Security-Policy',
    `default-src 'self'; ` +
    `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.youtube.com https://s.ytimg.com; ` +
    `script-src-attr 'unsafe-inline'; ` +
    `style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; ` +
    `font-src 'self' https://cdnjs.cloudflare.com; ` +
    `img-src 'self' data: blob: https:; ` +
    `frame-src https://www.youtube.com https://drive.google.com; ` +
    `connect-src ${connectSrc}; ` +
    `object-src 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'`
  );
  next();
});
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../frontend/pages')));
app.use('/js',     express.static(path.join(__dirname, '../frontend/js')));
app.use('/css',    express.static(path.join(__dirname, '../frontend/css')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
// Gestionnaire d'erreur CORS — renvoie 403 au lieu de planter le serveur
app.use((err, req, res, next) => {
  if (err.message === 'CORS_ORIGIN_NON_AUTORISEE') {
    return res.status(403).json({ error: 'CORS_ORIGIN_NON_AUTORISEE' });
  }
  next(err);
});
// ══════════════════════════════════════════════════════════
//  MIDDLEWARES
// ══════════════════════════════════════════════════════════
function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'NON_AUTHENTIFIE' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'TOKEN_INVALIDE' }); }
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'ADMIN_REQUIS' });
  next();
}
function optionalAuth(req, res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch {}
  }
  next();
}
// Retourne 0 (userId admin notif) si l'auteur est admin, sinon son id normal
async function _resolveNotifUserId(authorId) {
  if (!authorId) return null;
  const author = await db.getUserById(authorId);
  if (!author) return null;
  return author.role === 'admin' ? 0 : author.id;
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
function safeUser(u) {
  if (!u) return null;
  const { passwordHash, password_hash, ...safe } = u;
  return safe;
}
function parseId(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}
// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password, refCode, mmPhone, mmOperator, mmName } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'CHAMPS_MANQUANTS' });
  if (password.length < 6)          return res.status(400).json({ error: 'MOT_DE_PASSE_TROP_COURT' });
  if (!mmPhone)                     return res.status(400).json({ error: 'MM_PHONE_REQUIS' });
  try {
    const user = await db.createUser({ name, email, password, refCode, mmPhone, mmOperator, mmName });
    await db.createNotification({ userId: user.id, type: 'SUB_CONFIRMED',
      message: `Bienvenue sur Pagani Digital, ${name.split(' ')[0]} ! Votre espace est pret.`,
      link: 'dashboard.html' });
    await db.createNotification({ userId: 0, type: 'NEW_USER',
      message: `${name} vient de s'inscrire.`, link: 'dashboard.html?tab=admin&section=users' });
    // Auto-follow : le nouvel utilisateur suit l'admin par défaut
    try {
      const admins = (await db.getAllUsers()).filter(u => u.role === 'admin');
      for (const admin of admins) {
        await db.followUser(user.id, admin.id);
      }
    } catch(e) {}
    res.json({ token: makeToken(user), user: safeUser(user) });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db.login(email, password);
    res.json({ token: makeToken(user), user: safeUser(user) });
  } catch(e) { res.status(401).json({ error: e.message }); }
});
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'INTROUVABLE' });
    const purchases = await db.getVideoPurchasesByUser(req.user.id);
    const approvedPurchases = purchases.filter(p => p.statut === 'Approuvé').map(p => p.videoId);
    const stored = user.unlockedCourses || [];
    const unlockedCourses = [...new Set([...stored, ...approvedPurchases])];
    const fresh = makeToken(user);
    res.json({ ...safeUser(user), unlockedCourses, _token: fresh });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const user = await db.updateUser(req.user.id, req.body);
    res.json(safeUser(user));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try { await db.changePassword(req.user.id, oldPassword, newPassword); res.json({ ok: true }); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/auth/mm-account', requireAuth, async (req, res) => {
  const { operator, phone, name } = req.body;
  if (!operator || !phone || !name) return res.status(400).json({ error: 'CHAMPS_MANQUANTS' });
  try {
    const user = await db.addMmAccount(req.user.id, { operator, phone, name });
    res.json(safeUser(user));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  VIDEOS
// ══════════════════════════════════════════════════════════
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await db.getVideos();
    res.json(videos.map(v => ({
      id: v.id, title: v.title, desc: v.description, category: v.category,
      level: v.level, duration: v.duration, icon: v.icon,
      free: !!v.free,
      accessType: v.accessType || (v.free ? 'free' : 'pro'),
      unitPrice:  (v.accessType === 'unit' || v.unitPrice) ? (v.unitPrice || v.price || 0) : undefined,
      videoSource: v.videoSource,
      thumbnail: v.thumbnail || '',
      videoId: v.free ? (v.videoId || '') : undefined,
      moduleId: v.moduleId || null,
      videoDescription: v.videoDescription || ''
    })));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Vérifier si l'utilisateur a acheté le module d'une vidéo
  const hasModuleAccess = async (userId, moduleId) => {
    if (!moduleId) return false;
    return db.hasModulePurchase(userId, moduleId);
  };
  app.get('/api/videos/resolve/:token', requireAuth, (req, res) => {
  try {
    const p = jwt.verify(req.params.token, JWT_SECRET);
    if (p.userId !== req.user.id) return res.status(403).json({ error: 'TOKEN_INVALIDE' });
    res.json({ driveId: p.driveId });
  } catch { res.status(401).json({ error: 'TOKEN_EXPIRE' }); }
});
app.get('/api/videos/:id/token', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const video = await db.getVideoById(id);
    if (!video) return res.status(404).json({ error: 'VIDEO_INTROUVABLE' });
    if (video.free) return res.status(400).json({ error: 'VIDEO_GRATUITE' });
    const { plan, role, id: userId } = req.user;
    const hasPlan     = role === 'admin' || plan === 'Pro' || plan === 'Elite';
    const isUnitVideo = video.accessType === 'unit' || video.unitPrice || video.price;
    const hasPurchase = isUnitVideo && await db.hasVideoPurchase(userId, video.id);
    const user        = await db.getUserById(userId);
    const hasUnlocked = user && (user.unlockedCourses || []).includes(video.id);
    const hasModule   = video.moduleId && await db.hasModulePurchase(userId, video.moduleId);
    if (!hasPlan && !hasPurchase && !hasUnlocked && !hasModule)
      return res.status(403).json({ error: 'ACCES_REFUSE' });
    if (video.videoSource === 'drive') {
      const token = jwt.sign(
        { driveId: video.driveId, videoId: video.id, userId },
        JWT_SECRET, { expiresIn: VIDEO_TTL }
      );
      return res.json({ source: 'drive', token, ttl: VIDEO_TTL });
    }
    res.json({ source: 'youtube', videoId: video.videoId });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  POSTS
// ══════════════════════════════════════════════════════════
// Cache feed visiteurs — recalculé toutes les 60s max
let _guestFeedCache = null;
let _guestFeedCacheAt = 0;
const GUEST_FEED_TTL = 60000; // 60 secondes

app.get('/api/posts', optionalAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    // Membres connectés : feed personnalisé, pas de cache
    if (userId) {
      const posts = await db.getPostsAlgo(userId);
      return res.json(posts.map(p => ({ ...p, image: p.image ? '__HAS_IMAGE__' : '' })));
    }
    // Visiteurs : cache partagé 60s
    const now = Date.now();
    if (!_guestFeedCache || (now - _guestFeedCacheAt) > GUEST_FEED_TTL) {
      _guestFeedCache = (await db.getPostsAlgo(null)).map(p => ({ ...p, image: p.image ? '__HAS_IMAGE__' : '' }));
      _guestFeedCacheAt = now;
    }
    res.json(_guestFeedCache);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Réactions sur les posts
app.post('/api/posts/:id/react', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'EMOJI_REQUIS' });
    const result = await db.togglePostReaction(id, req.user.id, emoji);
    // Notifier l'auteur du post si nouvelle réaction
    if (result.action === 'added') {
      const post = await db.getPostById(id);
      if (post && post.authorId && post.authorId !== req.user.id) {
        const user = await db.getUserById(req.user.id);
        const _uid = await _resolveNotifUserId(post.authorId);
        if (_uid !== null) await db.createNotification({
          userId: _uid, type: 'REACTION',
          message: `${user?.name} a réagi ${emoji} à votre publication.`,
          link: `index.html#post-${post.id}`
        });
        // ML : incrémenter l'affinité + préférence catégorie
        await db.incrementInteraction(req.user.id, post.authorId, 'reactions_count');
        await db.incrementCategoryPref(req.user.id, post.category);
      }
    }
    res.json(result);
      if (_uid1 !== null) sendPush(_uid1, 'Nouvelle réaction', req.user.name + ' a réagi à votre post', 'index.html');
  } catch(e) {
    if (e.message === 'EMOJI_INVALIDE') return res.status(400).json({ error: 'EMOJI_INVALIDE' });
    res.status(500).json({ error: 'ERREUR_SERVEUR' });
  }
});

app.get('/api/posts/:id/reactions', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.getPostReactions(id));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});


app.get('/api/posts/:id/reactions-detail', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.getPostReactionsDetail(id));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Filtrer les posts par hashtag
app.get('/api/posts/hashtag/:tag', async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase().replace(/[^\w\u00C0-\u024F]/g, '');
    if (!tag) return res.status(400).json({ error: 'TAG_INVALIDE' });
    const posts = await db.getPosts();
    const filtered = posts.filter(p => {
      const text = ((p.title || '') + ' ' + (p.content || '')).toLowerCase();
      return text.includes('#' + tag);
    });
    res.json(filtered.map(p => ({ ...p, image: p.image ? '__HAS_IMAGE__' : '' })));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/posts/:id/image', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const post = await db.getPostById(id);
    if (!post) return res.status(404).json({ error: 'INTROUVABLE' });
    res.json({ image: post.image || '' });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Publication par un utilisateur connecté (non-admin)
app.put('/api/user-posts/:id', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const post = await db.getPostById(id);
    if (!post) return res.status(404).json({ error: 'INTROUVABLE' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'INTERDIT' });
    const { content, image } = req.body;
    const fields = { content };
    if (image !== undefined) fields.image = image;
    const updated = await db.updatePost(id, fields);
    res.json(updated);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.delete('/api/user-posts/:id', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const post = await db.getPostById(id);
    if (!post) return res.status(404).json({ error: 'INTROUVABLE' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'INTERDIT' });
    await db.deletePost(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/user-posts', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    const { title, content, image } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'CONTENU_VIDE' });
    const post = await db.createPost({
      title: title || (user.name + ' a publié'),
      content,
      category: 'Communauté',
      image: image || '',
      authorId: req.user.id,
      authorName: user.name,
      authorColor: user.avatarColor || '#6c63ff',
      authorPhoto: user.avatarPhoto || ''
    });
    // Invalider le cache visiteurs
    _guestFeedCache = null;
    res.json(post);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/posts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    const post = await db.createPost({
      ...req.body,
      authorId: req.user.id, authorName: 'Admin',
      authorColor: user?.avatarColor || '#6c63ff',
      authorPhoto: user?.avatarPhoto || ''
    });
    const allUsers = await db.getAllUsers();
    for (const u of allUsers.filter(u => u.role !== 'admin')) {
      await db.createNotification({ userId: u.id, type: 'NEW_POST',
        message: `Pagani Digital a publie : "${post.title}"`,
        link: `index.html#post-${post.id}` });
    }
    // Invalider le cache visiteurs
    _guestFeedCache = null;
    res.json(post);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/posts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const updated = await db.updatePost(id, req.body);
    res.json(updated);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.delete('/api/posts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    await db.deletePost(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// Boost admin d'un post (feed algorithmique)
app.patch('/api/admin/posts/:id/boost', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id    = parseId(req.params.id);
    const score = parseFloat(req.body.boostScore) || 0;
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    await _migPool.query('UPDATE posts SET boost_score = $1 WHERE id = $2', [score, id]);
    _guestFeedCache = null; // invalider le cache visiteurs
    res.json({ ok: true, boostScore: score });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const result = await db.toggleLike(id, req.user.email);
    if (result.liked) {
      const user = await db.getUserById(req.user.id);
      const post = await db.getPostById(id);
      if (post && post.authorId && post.authorId !== req.user.id) {
        const _uid1 = await _resolveNotifUserId(post.authorId);
        if (_uid1 !== null) await db.createNotification({ userId: _uid1, type: 'REACTION',
          message: `${user?.name} a aimé votre publication.`,
          link: `index.html#post-${post.id}` });
        // ML : incrémenter l'affinité + préférence catégorie
        await db.incrementInteraction(req.user.id, post.authorId, 'likes_count');
        await db.incrementCategoryPref(req.user.id, post.category);
      }
    }
    res.json(result);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const id   = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const user = await db.getUserById(req.user.id);
    const comment = await db.addComment(id, {
      authorId: req.user.id, authorName: user.name,
      authorColor: user.avatarColor, authorPhoto: user.avatarPhoto || '',
      text: req.body.text
    });
    const post = await db.getPostById(id);
    if (post && post.authorId && post.authorId !== req.user.id) {
      const _uid2 = await _resolveNotifUserId(post.authorId);
      if (_uid2 !== null) await db.createNotification({ userId: _uid2, type: 'COMMENT',
        message: `${user.name} a commenté votre publication.`,
        link: `index.html#post-${post.id}` });
      // ML : incrémenter l'affinité + préférence catégorie
      await db.incrementInteraction(req.user.id, post.authorId, 'comments_count');
      await db.incrementCategoryPref(req.user.id, post.category);
    }
    res.json(comment);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/posts/:id/comments/:cid/replies', requireAuth, async (req, res) => {
  try {
    const id   = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const user  = await db.getUserById(req.user.id);
    const reply = await db.addReply(id, req.params.cid, {
      authorId: req.user.id, authorName: user.name,
      authorColor: user.avatarColor, authorPhoto: user.avatarPhoto || '',
      text: req.body.text, replyTo: req.body.replyTo
    });
    const post    = await db.getPostById(id);
    const comment = post?.comments.find(c => c.id === req.params.cid);
    if (comment?.authorId && comment.authorId !== req.user.id) {
      const _uid3 = await _resolveNotifUserId(comment.authorId);
      if (_uid3 !== null) await db.createNotification({ userId: _uid3, type: 'COMMENT',
        message: `${user.name} a repondu a votre commentaire sur "${post.title}"`,
        link: `index.html#post-${post.id}` });
    }
    res.json(reply);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/navbar-button', async (req, res) => {
  try {
    res.json(await db.getNavbarButton());
  } catch { res.json({ enabled: false, label: '', icon_url: '', link: '' }); }
});
app.put('/api/admin/navbar-button', requireAuth, requireAdmin, async (req, res) => {
  const { enabled, label, icon_url, link } = req.body;
  try {
    await db.setNavbarButton({ enabled, label, icon_url, link });
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/social-links', async (req, res) => {
  try { res.json(await db.getSocialLinks()); }
  catch(e) { res.json({ facebook: '', tiktok: '', telegram: '', youtube: '' }); }
});
app.put('/api/admin/social-links', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.setSocialLinks(req.body);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? 0 : req.user.id;
    res.json(await db.getNotifications(userId));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// SSE — stream de notifications temps réel
const _sseClients = new Map(); // userId -> Set<res>

db.setSseNotifyHook((userId, notif) => {
  const clients = _sseClients.get(userId);
  if (clients && clients.size) {
    const data = `data: ${JSON.stringify(notif)}\n\n`;
    for (const client of clients) { try { client.write(data); } catch(e) {} }
  }
});

app.get('/api/notifications/stream', (req, res) => {
  // EventSource ne peut pas envoyer de headers — token en query string
  const token = req.query.token;
  if (!token) return res.status(401).end();
  let user;
  try { user = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).end(); }
  const userId = user.role === 'admin' ? 0 : user.id;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  res.write(': connected\n\n');
  if (!_sseClients.has(userId)) _sseClients.set(userId, new Set());
  _sseClients.get(userId).add(res);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch(e) {} }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    const set = _sseClients.get(userId);
    if (set) { set.delete(res); if (!set.size) _sseClients.delete(userId); }
  });
});
app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? 0 : req.user.id;
    res.json({ count: await db.countUnreadNotifications(userId) });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? 0 : req.user.id;
    await db.markNotificationsRead(userId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  COMMISSIONS & RETRAITS
// ══════════════════════════════════════════════════════════
app.get('/api/commissions', requireAuth, async (req, res) => {
  try { res.json(await db.getCommissions(req.user.id)); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/withdraws', requireAuth, async (req, res) => {
  try {
    const w    = await db.requestWithdraw({ userId: req.user.id, ...req.body });
    const user = await db.getUserById(req.user.id);
    await db.createNotification({ userId: 0, type: 'WITHDRAW_REQUEST',
      message: `${user?.name} demande un retrait de ${w.montant.toLocaleString('fr-FR')} AR`,
      link: 'dashboard.html' });
    res.json(w);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  COMPTES DE PAIEMENT
// ══════════════════════════════════════════════════════════
app.get('/api/payment-accounts', async (req, res) => {
  try { res.json(await db.getPaymentAccounts()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/payment-accounts/:operator', requireAuth, requireAdmin, async (req, res) => {
  try {
    const operator = decodeURIComponent(req.params.operator);
    res.json(await db.updatePaymentAccount(operator, req.body));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/admin/payment-accounts/:operator/toggle', requireAuth, requireAdmin, async (req, res) => {
  try {
    const operator = decodeURIComponent(req.params.operator);
    res.json(await db.togglePaymentAccount(operator, req.body));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/admin/payment-accounts/:operator', requireAuth, requireAdmin, async (req, res) => {
  try {
    const operator = decodeURIComponent(req.params.operator);
    res.json(await db.clearPaymentAccount(operator));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  ABONNEMENTS
// ══════════════════════════════════════════════════════════
app.get('/api/my-subscriptions', requireAuth, async (req, res) => {
  try {
    const all = await db.getUpgradeRequests();
    res.json(all.filter(r => r.userId === req.user.id));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/upgrade-request', requireAuth, async (req, res) => {
  const { plan, amount, phone, operator, txRef, proof } = req.body;
  const user = await db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'INTROUVABLE' });
  if (!proof || proof.trim() === '') return res.status(400).json({ error: 'PREUVE_REQUISE' });
  try {
    const upgradeReq = await db.createUpgradeRequest({
      userId: user.id, userName: user.name,
      plan, amount, phone, operator, txRef, proof: proof || ''
    });
    await db.createNotification({ userId: 0, type: 'NEW_SUBSCRIPTION',
      message: `${user.name} demande le plan ${plan} - ${amount.toLocaleString('fr-FR')} AR via ${operator} (${phone})${txRef ? ' | Ref: ' + txRef : ''}`,
      link: 'dashboard.html?tab=admin&section=subscriptions' });
    res.json({ ok: true, id: upgradeReq.id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/upgrade-requests', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getUpgradeRequests()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/upgrade-requests/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const req2 = await db.updateUpgradeRequest(id, req.body);
    if (req2.statut === 'Approuvé') {
      await db.createNotification({ userId: req2.userId, type: 'SUB_CONFIRMED',
        message: `Votre abonnement ${req2.plan} est maintenant actif !`,
        link: `dashboard.html?tab=subscription&sub=${req2.id}` });
    }
    // Rejet : depossession + notification gerees dans db.updateUpgradeRequest
    res.json(req2);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  MODULES VIDÉO
// ══════════════════════════════════════════════════════════
app.get('/api/video-modules', async (req, res) => {
  try { res.json(await db.getVideoModules()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/admin/video-modules', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createVideoModule(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/video-modules/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.updateVideoModule(id, req.body));
  }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/admin/video-modules/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    await db.deleteVideoModule(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  ACHATS MODULE
// ══════════════════════════════════════════════════════════
app.post('/api/module-purchase', requireAuth, async (req, res) => {
  const { moduleId, amount, phone, operator, txRef, proof } = req.body;
  if (!proof) return res.status(400).json({ error: 'PREUVE_REQUISE' });
  const mod = (await db.getVideoModules()).find(m => m.id === parseInt(moduleId));
  if (!mod) return res.status(404).json({ error: 'MODULE_INTROUVABLE' });
  if (!mod.modulePrice) return res.status(400).json({ error: 'MODULE_SANS_PRIX' });
  if (await db.hasModulePurchase(req.user.id, parseInt(moduleId)))
    return res.status(400).json({ error: 'DEJA_ACHETE' });
  try {
    const user = await db.getUserById(req.user.id);
    const purchase = await db.createModulePurchase({
      userId: req.user.id, moduleId: parseInt(moduleId),
      amount: amount || mod.modulePrice,
      phone: phone || '', operator: operator || '',
      mmName: req.body.mmName || '', txRef: txRef || '', proof
    });
    await db.createNotification({
      userId: 0, type: 'NEW_FORMATION',
      message: `${user.name} a acheté le module "${mod.title}" - ${purchase.amount.toLocaleString('fr-FR')} AR`,
      link: 'dashboard.html?tab=admin&section=modulepurchases'
    });
    res.json({ ok: true, id: purchase.id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/my-module-purchases', requireAuth, async (req, res) => {
  try { res.json(await db.getModulePurchasesByUser(req.user.id)); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/module-purchases', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getAllModulePurchases()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/module-purchases/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const purchase = await db.updateModulePurchase(id, req.body);
    // Notifications et depossession gerees dans db.updateModulePurchase
    res.json(purchase);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  ADMIN — VIDEOS, STATS, USERS
// ══════════════════════════════════════════════════════════
app.get('/api/admin/videos', requireAuth, requireAdmin, async (req, res) => {
  try {
    const videos = await db.getVideos();
    res.json(videos.map(v => ({ ...v, passwordHash: undefined })));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/admin/videos', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createVideo(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/videos/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.updateVideo(id, req.body));
  }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/admin/videos/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    await db.deleteVideo(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getAdminStats()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users.map(safeUser));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const updated = await db.adminUpdateUser(id, req.body);
    if (req.body.plan) {
      await db.createNotification({ userId: id, type: 'SUB_CONFIRMED',
        message: `Votre plan a ete mis a jour : ${req.body.plan}.`,
        link: 'formations.html' });
    }
    res.json(safeUser(updated));
  } catch(e) {
    const clientErrors = ['PLAN_INVALIDE', 'ROLE_INVALIDE'];
    if (clientErrors.includes(e.message)) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: 'ERREUR_SERVEUR' });
  }
});
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const user = await db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'INTROUVABLE' });
    if (user.role === 'admin') return res.status(403).json({ error: 'IMPOSSIBLE_SUPPRIMER_ADMIN' });
    await db.deleteUser(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/users/:id/commissions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.getCommissions(id));
  }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  TARIFS
// ══════════════════════════════════════════════════════════
app.get('/api/pricing', async (req, res) => {
  try { res.json(await db.getPricing()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/pricing', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.updatePricing(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  ACHATS VIDEO UNITAIRES
// ══════════════════════════════════════════════════════════
app.post('/api/video-purchase', requireAuth, async (req, res) => {
  const { courseId, videoId: rawVideoId, amount, phone, operator, txRef, proof } = req.body;
  const vid = parseInt(courseId || rawVideoId);
  if (!proof) return res.status(400).json({ error: 'PREUVE_REQUISE' });
  const user  = await db.getUserById(req.user.id);
  const video = await db.getVideoById(vid);
  if (!video) return res.status(404).json({ error: 'VIDEO_INTROUVABLE' });
  const isUnit = video.accessType === 'unit' || video.unitPrice || video.price;
  if (!isUnit) return res.status(400).json({ error: 'VIDEO_NON_UNITAIRE' });
  if (await db.hasVideoPurchase(req.user.id, vid))
    return res.status(400).json({ error: 'DEJA_ACHETE' });
  try {
    const purchase = await db.createVideoPurchase({
      userId: req.user.id, videoId: vid,
      amount: amount || video.unitPrice || video.price || 0,
      phone: phone || '', operator: operator || '',
      mmName: req.body.mmName || '', txRef: txRef || '', proof
    });
    await db.createNotification({
      userId: 0, type: 'NEW_FORMATION',
      message: `${user.name} a achete la video "${video.title}" - ${purchase.amount.toLocaleString('fr-FR')} AR`,
      link: 'dashboard.html?tab=admin&section=videopurchases'
    });
    res.json({ ok: true, id: purchase.id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/my-video-purchases', requireAuth, async (req, res) => {
  try { res.json(await db.getVideoPurchasesByUser(req.user.id)); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/video-purchases', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getPendingVideoPurchases()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/video-purchases/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const purchase = await db.updateVideoPurchase(id, req.body);
    res.json(purchase);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════
//  PARTAGES FACEBOOK
// ══════════════════════════════════════════════════════════
app.post('/api/posts/:id/share', requireAuth, async (req, res) => {
  try {
    const postId = parseId(req.params.id);
    if (!postId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const post = await db.getPostById(postId);
    if (!post) return res.status(404).json({ error: 'POST_INTROUVABLE' });
    await db.recordShare({ postId, userId: req.user.id, refCode: req.user.refCode || '' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/shares', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getShareStats()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  STORIES
// ══════════════════════════════════════════════════════════
// GET toutes les stories actives (non expirées) groupées par user
app.get('/api/stories', requireAuth, async (req, res) => {
  try {
    const result = await _migPool.query(`
      SELECT s.id, s.user_id, s.content, s.image, s.bg_color, s.expires_at, s.created_at,
             u.name as user_name, u.avatar_color, u.avatar_photo,
             EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id=s.id AND sv.user_id=$1) as viewed,
             (SELECT COUNT(*) FROM story_views sv2 WHERE sv2.story_id=s.id) as view_count
      FROM stories s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > NOW()
      ORDER BY s.created_at DESC
    `, [req.user.id]);
    // Grouper par user
    const map = new Map();
    result.rows.forEach(s => {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, {
          userId: s.user_id, userName: s.user_name,
          avatarColor: s.avatar_color, avatarPhoto: s.avatar_photo || '',
          stories: [], allViewed: true, viewCount: 0
        });
      }
      const g = map.get(s.user_id);
      g.stories.push({ id: s.id, content: s.content, image: s.image, bgColor: s.bg_color, expiresAt: s.expires_at, createdAt: s.created_at, viewed: s.viewed, viewCount: parseInt(s.view_count) || 0 });
      if (!s.viewed) g.allViewed = false;
      g.viewCount += parseInt(s.view_count) || 0;
    });
    res.json([...map.values()]);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST créer une story
app.post('/api/stories', requireAuth, async (req, res) => {
  const { content, image, bgColor } = req.body;
  if (!content && !image) return res.status(400).json({ error: 'CONTENU_VIDE' });
  try {
    const r = await _migPool.query(
      `INSERT INTO stories (user_id, content, image, bg_color) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, content || '', image || '', bgColor || '#6c63ff']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST marquer une story comme vue
app.post('/api/stories/:id/view', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    await _migPool.query(
      `INSERT INTO story_views (story_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, req.user.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// GET vues d'une story avec identité conditionnelle (follower = identifié, sinon anonyme)
app.get('/api/stories/:id/views-count', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    // Vérifier que c'est bien la story du demandeur
    const storyCheck = await _migPool.query(`SELECT user_id FROM stories WHERE id=$1`, [id]);
    if (!storyCheck.rows.length || storyCheck.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'INTERDIT' });
    // Récupérer les viewers avec info conditionnelle
    const r = await _migPool.query(`
      SELECT
        sv.user_id,
        sv.viewed_at,
        CASE WHEN f.follower_id IS NOT NULL THEN u.name ELSE NULL END AS name,
        CASE WHEN f.follower_id IS NOT NULL THEN u.avatar_photo ELSE NULL END AS avatar_photo,
        CASE WHEN f.follower_id IS NOT NULL THEN u.avatar_color ELSE NULL END AS avatar_color,
        sr.emoji
      FROM story_views sv
      JOIN users u ON u.id = sv.user_id
      LEFT JOIN follows f ON f.follower_id = sv.user_id AND f.following_id = $2
      LEFT JOIN story_reactions sr ON sr.story_id = sv.story_id AND sr.user_id = sv.user_id
      WHERE sv.story_id = $1
      ORDER BY sv.viewed_at DESC
    `, [id, req.user.id]);
    res.json({ count: r.rows.length, viewers: r.rows });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// GET ma réaction sur une story
app.get('/api/stories/:id/my-reaction', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const r = await _migPool.query(
      `SELECT emoji FROM story_reactions WHERE story_id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    res.json({ emoji: r.rows[0]?.emoji || null });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST réagir à une story (toggle)
app.post('/api/stories/:id/react', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'EMOJI_REQUIS' });
    // Vérifier que la story existe
    const storyCheck = await _migPool.query(`SELECT user_id FROM stories WHERE id=$1 AND expires_at > NOW()`, [id]);
    if (!storyCheck.rows.length) return res.status(404).json({ error: 'STORY_INTROUVABLE' });
    const storyOwnerId = storyCheck.rows[0].user_id;
    // Toggle : si déjà réagi avec le même emoji, supprimer
    const existing = await _migPool.query(
      `SELECT id FROM story_reactions WHERE story_id=$1 AND user_id=$2`,
      [id, req.user.id]
    );
    if (existing.rows.length) {
      if (existing.rows[0].emoji === emoji) {
        await _migPool.query(`DELETE FROM story_reactions WHERE story_id=$1 AND user_id=$2`, [id, req.user.id]);
        return res.json({ action: 'removed', emoji });
      }
      await _migPool.query(`UPDATE story_reactions SET emoji=$3, created_at=NOW() WHERE story_id=$1 AND user_id=$2`, [id, req.user.id, emoji]);
    } else {
      await _migPool.query(
        `INSERT INTO story_reactions (story_id, user_id, emoji) VALUES ($1,$2,$3)`,
        [id, req.user.id, emoji]
      );
      // Notifier le créateur
      if (storyOwnerId !== req.user.id) {
        const reactor = await db.getUserById(req.user.id);
        await db.createNotification({
          userId: storyOwnerId, type: 'REACTION',
          message: `${reactor?.name} a réagi ${emoji} à votre story.`,
          link: 'index.html'
        });
      }
    }
    res.json({ action: 'added', emoji });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// GET réactions d'une story
app.get('/api/stories/:id/reactions', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const r = await _migPool.query(
      `SELECT emoji, COUNT(*) as count FROM story_reactions WHERE story_id=$1 GROUP BY emoji ORDER BY count DESC`,
      [id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// DELETE supprimer sa propre story
app.delete('/api/stories/:id', requireAuth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const r = await _migPool.query(`DELETE FROM stories WHERE id=$1 AND user_id=$2 RETURNING id`, [id, req.user.id]);
    if (!r.rowCount) return res.status(403).json({ error: 'INTERDIT' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  BADGES
// ══════════════════════════════════════════════════════════
function computeBadges(user, postCount) {
  const badges = [];
  const refs = user.refs || 0;
  const days = Math.floor((Date.now() - new Date(user.createdAt)) / 86400000);

  if (user.plan === 'Elite') badges.push({ id: 'elite',       label: 'Elite',         icon: '👑', color: '#f59e0b' });
  if (user.plan === 'Pro')   badges.push({ id: 'pro',         label: 'Pro',           icon: '⭐', color: '#6c63ff' });
  if (refs >= 80)            badges.push({ id: 'icone',        label: 'Icône',         icon: '👑', color: '#f59e0b' });
  else if (refs >= 40)       badges.push({ id: 'legende',      label: 'Légende',       icon: '💎', color: '#00d4aa' });
  else if (refs >= 20)       badges.push({ id: 'superparrain', label: 'Super Parrain', icon: '🚀', color: '#6c63ff' });
  else if (refs >= 10)       badges.push({ id: 'recruteur',    label: 'Recruteur',     icon: '🎯', color: '#8b5cf6' });
  else if (refs >= 3)        badges.push({ id: 'ambassadeur',  label: 'Ambassadeur',   icon: '🌟', color: '#f59e0b' });
  if (postCount >= 10)       badges.push({ id: 'influenceur', label: 'Influenceur',   icon: '📢', color: '#ff4d6d' });
  else if (postCount >= 3)   badges.push({ id: 'contributeur',label: 'Contributeur',  icon: '✍️', color: '#8b5cf6' });
  if (days >= 30)            badges.push({ id: 'veteran',     label: 'Vétéran',       icon: '🎖️', color: '#00d4aa' });
  return badges;
}

app.get('/api/users/:id/badges', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const user = await db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'INTROUVABLE' });
    const posts = await db.getPostsByUser(id);
    res.json(computeBadges(user, posts.length));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

app.get('/api/auth/me/badges', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'INTROUVABLE' });
    const posts = await db.getPostsByUser(req.user.id);
    res.json(computeBadges(user, posts.length));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  LEADERBOARD PARRAINAGES
// ══════════════════════════════════════════════════════════

app.get('/api/my-referrals', requireAuth, async (req, res) => {
  try {
    const all = await db.getAllUsers();
    const list = all
      .filter(u => u.referredBy === req.user.id)
      .map(u => ({
        id: u.id, name: u.name, plan: u.plan,
        avatarColor: u.avatarColor, avatarPhoto: u.avatarPhoto || '',
        isActive: u.isActive, createdAt: u.createdAt
      }));
    res.json(list);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// ══════════════════════════════════════════════════════════
//  LEADERBOARD MENSUEL
// ══════════════════════════════════════════════════════════
app.get('/api/leaderboard/monthly', async (req, res) => {
  try {
    const month = req.query.month || null;
    res.json(await db.getMonthlyLeaderboard(month));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

app.get('/api/leaderboard/config', async (req, res) => {
  try { res.json(await db.getLeaderboardConfig()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

app.put('/api/admin/leaderboard/config', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.updateLeaderboardConfig(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/admin/leaderboard/rewards', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getLeaderboardRewards()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

app.post('/api/admin/leaderboard/rewards', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { month, prize1, prize2, prize3, winner1Id, winner2Id, winner3Id } = req.body;
    if (!month) return res.status(400).json({ error: 'MOIS_REQUIS' });
    const reward = await db.saveLeaderboardReward(month, { prize1, prize2, prize3, winner1Id, winner2Id, winner3Id });
    // Notifier les gagnants
    const prizes = [{ id: winner1Id, amount: prize1, rank: 1 }, { id: winner2Id, amount: prize2, rank: 2 }, { id: winner3Id, amount: prize3, rank: 3 }];
    const rankLabels = { 1: '1er', 2: '2eme', 3: '3eme' };
    for (const p of prizes) {
      if (p.id && p.amount) {
        const msg = '🏆 Felicitations ! Vous etes ' + rankLabels[p.rank] + ' du leaderboard de ' + month + ' ! Vous recevrez ' + Number(p.amount).toLocaleString('fr-FR') + ' AR.';
        await db.createNotification({ userId: p.id, type: 'SUB_CONFIRMED', message: msg, link: 'affiliation.html' });
      }
    }
    res.json(reward);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/admin/leaderboard/rewards/:month/paid/:rank', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.markRewardPaid(req.params.month, req.params.rank);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    const leaderboard = users
      .filter(u => u.isActive && (u.refs || 0) > 0)
      .sort((a, b) => (b.refs || 0) - (a.refs || 0))
      .slice(0, 10)
      .map((u, i) => ({
        rank: i + 1,
        id: u.id,
        name: u.name,
        plan: u.plan,
        avatarColor: u.avatarColor,
        avatarPhoto: u.avatarPhoto || '',
        refs: u.refs || 0
      }));
    res.json(leaderboard);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  EXPLORE — liste publique des membres
// ══════════════════════════════════════════════════════════
app.get('/api/members', async (req, res) => {
  try {
    const users = await db.getPublicMembers();
    res.json(users.map(u => ({
      id: u.id, name: u.name, plan: u.plan,
      avatarColor: u.avatarColor, avatarPhoto: u.avatarPhoto || '',
      bio: u.bio || '', createdAt: u.createdAt
    })));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  PROFIL PUBLIC
// ══════════════════════════════════════════════════════════
app.get('/api/users/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    const user = await db.getUserById(id);
    if (!user || !user.isActive) return res.status(404).json({ error: 'INTROUVABLE' });
    const posts = await db.getPostsByUser(user.id);
    res.json({
      id: user.id, name: user.name, plan: user.plan, refCode: user.refCode,
      avatarColor: user.avatarColor, avatarPhoto: user.avatarPhoto || '',
      bio: user.bio || '', location: user.location || '', website: user.website || '',
      createdAt: user.createdAt, role: user.role,
      postCount: posts.length,
      streak: user.streak || 0,
      followingPrivacy: user.followingPrivacy || 'public'
    });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  FOLLOWS
// ══════════════════════════════════════════════════════════
// Toggle follow/unfollow
app.post('/api/users/:id/follow', requireAuth, async (req, res) => {
  const targetId = parseId(req.params.id);
  if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'CANNOT_FOLLOW_SELF' });
  try {
    // Vérifier si la cible est un admin
    const target = await db.getUserById(targetId);
    if (!target) return res.status(404).json({ error: 'UTILISATEUR_INTROUVABLE' });
    const already = await db.isFollowing(req.user.id, targetId);
    if (already) {
      // Bloquer le unfollow si la cible est un admin
      if (target.role === 'admin') {
        return res.status(403).json({ error: 'CANNOT_UNFOLLOW_ADMIN' });
      }
      await db.unfollowUser(req.user.id, targetId);
      res.json({ following: false });
    } else {
      await db.followUser(req.user.id, targetId);
      const follower = await db.getUserById(req.user.id);
      await db.createNotification({
        userId: targetId, type: 'NEW_FOLLOWER',
        message: `${follower.name} vous suit maintenant.`,
        link: `profil.html?id=${req.user.id}`
      });
      res.json({ following: true });
      sendPush(targetId, follower.name + ' vous suit', 'Nouveau abonné sur Pagani Digital', `profil.html?id=${req.user.id}`);
    }
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// Posts d'un utilisateur spécifique
app.get('/api/users/:id/posts', async (req, res) => {
  const authorId = parseId(req.params.id);
  if (!authorId) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const posts = await db.getPostsByUser(authorId);
    res.json(posts.map(p => ({ ...p, image: p.image ? '__HAS_IMAGE__' : '' })));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// Statut follow pour un profil
app.get('/api/users/:id/follow-status', requireAuth, async (req, res) => {
  try {
    const targetId = parseId(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const target = await db.getUserById(targetId);
    const [isFollow, followers, followingCount] = await Promise.all([
      db.isFollowing(req.user.id, targetId),
      db.countFollowers(targetId),
      db.countFollowing(targetId)
    ]);
    res.json({
      following: isFollow,
      followers,
      followingCount,
      isAdmin: target ? target.role === 'admin' : false
    });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Stats follow d'un profil public
app.get('/api/users/:id/follow-stats', async (req, res) => {
  try {
    const targetId = parseId(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const [followers, following] = await Promise.all([
      db.countFollowers(targetId),
      db.countFollowing(targetId)
    ]);
    res.json({ followers, following });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Liste des followers d'un utilisateur
app.get('/api/users/:id/followers', async (req, res) => {
  try {
    const targetId = parseId(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.getFollowers(targetId));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Liste des abonnements d'un utilisateur
app.get('/api/users/:id/following', optionalAuth, async (req, res) => {
  try {
    const targetId = parseId(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const target = await db.getUserById(targetId);
    if (!target) return res.status(404).json({ error: 'UTILISATEUR_INTROUVABLE' });
    const privacy = target.followingPrivacy || 'public';
    const viewerId = req.user ? req.user.id : null;
    if (viewerId === targetId) return res.json(await db.getFollowing(targetId));
    if (privacy === 'private') return res.json([]);
    if (privacy === 'friends') {
      if (!viewerId) return res.json([]);
      const [vft, tfv] = await Promise.all([
        db.isFollowing(viewerId, targetId),
        db.isFollowing(targetId, viewerId),
      ]);
      if (!vft || !tfv) return res.json([]);
    }
    res.json(await db.getFollowing(targetId));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  MESSAGES PRIVÉS
// ══════════════════════════════════════════════════════════
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try { res.json(await db.getConversations(req.user.id)); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/messages/unread-count', requireAuth, async (req, res) => {
  try { res.json({ count: await db.countUnreadMessages(req.user.id) }); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// GET /api/messages/:userId/reactions
app.get('/api/messages/:userId/reactions', requireAuth, async (req, res) => {
  try {
    const otherId = parseId(req.params.userId);
    if (!otherId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const rows = await _migPool.query(
      'SELECT r.message_id, r.emoji, r.user_id FROM message_reactions r JOIN private_messages m ON m.id=r.message_id WHERE (m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1)',
      [req.user.id, otherId]
    );
    const result = {};
    rows.rows.forEach(r => {
      const mid = String(r.message_id);
      if (!result[mid]) result[mid] = {};
      if (!result[mid][r.emoji]) result[mid][r.emoji] = [];
      result[mid][r.emoji].push(r.user_id);
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

app.get('/api/messages/:userId', requireAuth, async (req, res) => {
  try {
    const otherId = parseId(req.params.userId);
    if (!otherId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const { limit, before } = req.query;
    res.json(await db.getPrivateMessages(req.user.id, otherId, limit, before));
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/messages/:userId', requireAuth, async (req, res) => {
  try {
    const receiverId = parseId(req.params.userId);
    const { content, image, replyToId } = req.body;
    if ((!content || !content.trim()) && !image) return res.status(400).json({ error: 'CONTENU_VIDE' });
    if (!receiverId) return res.status(400).json({ error: 'ID_INVALIDE' });
    // Limite taille image : ~2 Mo en base64
    if (image && image.length > 2 * 1024 * 1024 * 1.37) return res.status(400).json({ error: 'IMAGE_TROP_GRANDE' });
    const receiver = await db.getUserById(receiverId);
    if (!receiver) return res.status(404).json({ error: 'UTILISATEUR_INTROUVABLE' });
    const msg = await db.sendPrivateMessage(req.user.id, receiverId, (content || '').trim(), image || '', replyToId || null);
    const sender = await db.getUserById(req.user.id);
    await db.createNotification({
      userId: receiverId, type: 'PRIVATE_MESSAGE',
      message: `${sender.name} vous a envoyé un message privé.`,
      link: `messages.html?with=${req.user.id}`
    });
    res.json(msg);
    sendPush(receiverId, sender.name, content ? content.trim().slice(0,80) : 'Photo', `messages.html?with=${req.user.id}`);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Marquer les messages d'une conversation comme lus
app.patch('/api/messages/:userId/read', requireAuth, async (req, res) => {
  try {
    const senderId = parseId(req.params.userId);
    if (!senderId) return res.status(400).json({ error: 'ID_INVALIDE' });
    await db.markMessagesRead(req.user.id, senderId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// Supprimer un message (seulement le sien)
app.delete('/api/messages/:userId/:msgId', requireAuth, async (req, res) => {
  try {
    const msgId = parseId(req.params.msgId);
    if (!msgId) return res.status(400).json({ error: 'ID_INVALIDE' });
    const deleted = await db.deletePrivateMessage(msgId, req.user.id);
    if (!deleted) return res.status(403).json({ error: 'INTERDIT' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  RÉACTIONS SUR LES MESSAGES
// ══════════════════════════════════════════════════════════

// POST /api/messages/:userId/:msgId/reaction
app.post('/api/messages/:userId/:msgId/reaction', requireAuth, async (req, res) => {
  try {
    const otherId = parseId(req.params.userId);
    const msgId   = parseId(req.params.msgId);
    const { emoji, action } = req.body;
    if (!otherId || !msgId) return res.status(400).json({ error: 'ID_INVALIDE' });
    if (!emoji)             return res.status(400).json({ error: 'EMOJI_REQUIS' });
    const ALLOWED = ['❤️','😂','😮','😢','😡','👍'];
    if (!ALLOWED.includes(emoji)) return res.status(400).json({ error: 'EMOJI_INVALIDE' });
    if (action === 'remove') {
      await _migPool.query(
        'DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2',
        [msgId, req.user.id]
      );
    } else {
      await _migPool.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji=$3, created_at=NOW()',
        [msgId, req.user.id, emoji]
      );
    }
    // Push SSE instantané à l'autre utilisateur
    try {
      const clients = _sseClients.get(otherId);
      if (clients && clients.size) {
        const payload = JSON.stringify({ type: 'REACTION', msgId, emoji, userId: req.user.id, action: action || 'add' });
        for (const c of clients) { try { c.write('data: ' + payload + '\n\n'); } catch(e) {} }
      }
    } catch(e) {}
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
// ══════════════════════════════════════════════════════════
//  FALLBACK SPA
// ══════════════════════════════════════════════════════════

// ======================================================
//  TYPING INDICATOR
// ======================================================
// Map : senderId -> { receiverId, expiresAt }
const _typingMap = new Map();
const TYPING_TTL = 6000;

app.post('/api/typing/:userId', requireAuth, (req, res) => {
  const receiverId = parseInt(req.params.userId);
  if (!receiverId) return res.status(400).json({ error: 'ID_INVALIDE' });
  _typingMap.set(req.user.id, { receiverId, expiresAt: Date.now() + TYPING_TTL });
  res.json({ ok: true });
});

app.get('/api/typing/:userId', requireAuth, (req, res) => {
  const senderId = parseInt(req.params.userId);
  if (!senderId) return res.status(400).json({ error: 'ID_INVALIDE' });
  const entry = _typingMap.get(senderId);
  const typing = !!(entry && entry.receiverId === req.user.id && entry.expiresAt > Date.now());
  res.json({ typing });
});

// ======================================================
//  PRESENCE EN LIGNE
// ======================================================
const _presenceMap = new Map();
const PRESENCE_TTL = 45000;

app.post('/api/presence/ping', requireAuth, (req, res) => {
  const now = Date.now();
  _presenceMap.set(req.user.id, now);
  // Persister en base pour survivre aux redémarrages
  db.updateLastSeen(req.user.id, now).catch(() => {});
  db.updateStreak(req.user.id).catch(() => {});
  res.json({ ok: true });
});

app.get('/api/presence/:userId', requireAuth, async (req, res) => {
  const targetId = parseId(req.params.userId);
  if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
  const ramLast = _presenceMap.get(targetId);
  const online  = !!ramLast && (Date.now() - ramLast) < PRESENCE_TTL;
  // Si pas en RAM, lire last_seen depuis la base
  let lastSeen = ramLast || null;
  if (!lastSeen) lastSeen = await db.getLastSeen(targetId).catch(() => null);
  res.json({ online, lastSeen });
});

app.post('/api/presence/batch', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  var result = {};
  ids.forEach(function(id) {
    var last = _presenceMap.get(id);
    result[id] = !!last && (Date.now() - last) < PRESENCE_TTL;
  });
  res.json(result);
});
// ══════════════════════════════════════════════════════════
//  EBOOKS
// ══════════════════════════════════════════════════════════
app.get('/api/ebooks', async (req, res) => {
  try { res.json(await db.getEbooks()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/ebooks', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getAllEbooksAdmin()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/admin/ebooks', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createEbook(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/ebooks/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.updateEbook(id, req.body));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/admin/ebooks/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    await db.deleteEbook(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.post('/api/ebook-purchase', requireAuth, async (req, res) => {
  const { ebookId, amount, phone, operator, mmName, txRef, proof } = req.body;
  if (!proof) return res.status(400).json({ error: 'PREUVE_REQUISE' });
  const ebook = await db.getEbookById(parseInt(ebookId));
  if (!ebook) return res.status(404).json({ error: 'EBOOK_INTROUVABLE' });
  if (await db.hasEbookPurchase(req.user.id, parseInt(ebookId)))
    return res.status(400).json({ error: 'DEJA_ACHETE' });
  try {
    const user = await db.getUserById(req.user.id);
    const purchase = await db.createEbookPurchase({
      userId: req.user.id, ebookId: parseInt(ebookId),
      amount: amount || ebook.price,
      phone: phone || '', operator: operator || '',
      mmName: mmName || '', txRef: txRef || '', proof
    });
    await db.createNotification({
      userId: 0, type: 'NEW_FORMATION',
      message: `${user.name} a acheté l'ebook "${ebook.title}" - ${purchase.amount.toLocaleString('fr-FR')} AR`,
      link: 'dashboard.html?tab=admin&section=ebookpurchases'
    });
    res.json({ ok: true, id: purchase.id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/my-ebook-purchases', requireAuth, async (req, res) => {
  try { res.json(await db.getEbookPurchasesByUser(req.user.id)); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.get('/api/admin/ebook-purchases', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.getAllEbookPurchases()); }
  catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});
app.put('/api/admin/ebook-purchases/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID_INVALIDE' });
    res.json(await db.updateEbookPurchase(id, req.body));
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ── PUSH ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'INVALID_SUB' });
  try {
    await db.pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'INVALID_SUB' });
  try {
    await db.pool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [req.user.id, endpoint]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// Route migration one-shot — supprimer après usage
app.get('/api/run-migration-push', async (req, res) => {
  if (req.query.secret !== process.env.JWT_SECRET) return res.status(403).json({ error: 'FORBIDDEN' });
  try {
    await db.pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.pool.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)');
    res.json({ ok: true, message: 'Table push_subscriptions cree' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/pages/index.html'));
  } else {
    res.status(404).json({ error: 'ROUTE_INTROUVABLE' });
  }
});
// Migrations automatiques au démarrage
const { Pool } = require('pg');
const _migPool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({ user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT || 5432 });

async function runMigrations() {
  await require('./migrations').runMigrations(_migPool);
  // Migration table post_reactions
  try {
    await _migPool.query(`CREATE TABLE IF NOT EXISTS post_reactions (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    )`);
    await _migPool.query(`CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id)`);
  } catch(e) { console.error('migrate post_reactions:', e.message); }
  // Migration réactions messages
  try {
    await _migPool.query(`CREATE TABLE IF NOT EXISTS message_reactions (id SERIAL PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES private_messages(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, emoji TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(message_id, user_id))`);
    await _migPool.query(`CREATE INDEX IF NOT EXISTS idx_msg_reactions_message ON message_reactions(message_id)`);
  } catch(e) { console.error('migrate message_reactions:', e.message); }
  // Migration réactions stories
  try {
    await _migPool.query(`CREATE TABLE IF NOT EXISTS story_reactions (
      id SERIAL PRIMARY KEY,
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(story_id, user_id)
    )`);
    await _migPool.query(`CREATE INDEX IF NOT EXISTS idx_story_reactions_story ON story_reactions(story_id)`);
  } catch(e) { console.error('migrate story_reactions:', e.message); }
}

app.listen(PORT, '0.0.0.0', async () => {
  await runMigrations();
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  ✅  Pagani Digital — Serveur demarre        ║`);
  console.log(`║  🌐  http://localhost:${PORT}                   ║`);
  console.log(`║  📡  http://${localIP || 'localhost'}:${PORT}                ║`);
  console.log(`║  📁  Frontend : ../frontend/                  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  if (localIP) console.log(`[CORS] IP locale autorisée : http://${localIP}:${PORT}`);
});
