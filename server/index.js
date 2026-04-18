require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const jwt       = require('jsonwebtoken');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const db        = require('./database');
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
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await db.getPosts();
    res.json(posts.map(p => ({ ...p, image: p.image ? '__HAS_IMAGE__' : '' })));
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
    const { content, image } = req.body;
    if ((!content || !content.trim()) && !image) return res.status(400).json({ error: 'CONTENU_VIDE' });
    if (!receiverId) return res.status(400).json({ error: 'ID_INVALIDE' });
    // Limite taille image : ~2 Mo en base64
    if (image && image.length > 2 * 1024 * 1024 * 1.37) return res.status(400).json({ error: 'IMAGE_TROP_GRANDE' });
    const receiver = await db.getUserById(receiverId);
    if (!receiver) return res.status(404).json({ error: 'UTILISATEUR_INTROUVABLE' });
    const msg = await db.sendPrivateMessage(req.user.id, receiverId, (content || '').trim(), image || '');
    const sender = await db.getUserById(req.user.id);
    await db.createNotification({
      userId: receiverId, type: 'PRIVATE_MESSAGE',
      message: `${sender.name} vous a envoyé un message privé.`,
      link: `messages.html?with=${req.user.id}`
    });
    res.json(msg);
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
// ══════════════════════════════════════════════════════════
//  FALLBACK SPA
// ══════════════════════════════════════════════════════════

// ======================================================
//  PRESENCE EN LIGNE
// ======================================================
const _presenceMap = new Map();
const PRESENCE_TTL = 45000;

app.post('/api/presence/ping', requireAuth, (req, res) => {
  _presenceMap.set(req.user.id, Date.now());
  res.json({ ok: true });
});

app.get('/api/presence/:userId', requireAuth, (req, res) => {
  const targetId = parseId(req.params.userId);
  if (!targetId) return res.status(400).json({ error: 'ID_INVALIDE' });
  const last = _presenceMap.get(targetId);
  const online = !!last && (Date.now() - last) < PRESENCE_TTL;
  res.json({ online, lastSeen: last || null });
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

async function runMigrations() { await require('./migrations').runMigrations(_migPool); }

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
