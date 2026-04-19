const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// 🔌 Connexion PostgreSQL
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'pagani',
      password: process.env.DB_PASSWORD || process.env.DB_PASS || 'password',
      port: process.env.DB_PORT || 5432,
    });

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

// snake_case → camelCase (préserve les acronymes connus : AR)
function toCamel(str) {
  return str
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/Ar$/,  'AR')
    .replace(/ArIs/, 'ARIs');
}

function rowToCamel(row) {
  if (!row) return null;
  const out = {};
  for (const key of Object.keys(row)) out[toCamel(key)] = row[key];
  return out;
}

function rowsToCamel(rows) {
  return rows.map(rowToCamel);
}

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

// ═══════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════

async function createUser({ name, email, password, refCode, mmPhone, mmOperator, mmName }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) throw new Error('EMAIL_TAKEN');

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  const result = await query(
    `INSERT INTO users 
    (name, email, password_hash, role, plan, ref_code, mm_phone, mm_operator, mm_name, created_at, updated_at)
    VALUES ($1,$2,$3,'user','Starter',$4,$5,$6,$7,$8,$8)
    RETURNING *`,
    [
      name,
      email,
      hash,
      generateRefCode(),
      mmPhone || '',
      mmOperator || 'MVola',
      mmName || name,
      now
    ]
  );

  return rowToCamel(result.rows[0]);
}

async function login(email, password) {
  const res = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (!res.rows.length) throw new Error('USER_NOT_FOUND');
  const user = rowToCamel(res.rows[0]);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('WRONG_PASSWORD');
  return user;
}

async function getUserById(id) {
  const res = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rowToCamel(res.rows[0]) || null;
}

async function getAllUsers() {
  const res = await query('SELECT * FROM users ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function updateUser(id, fields) {
  // Champs modifiables par l'utilisateur lui-meme
  const allowedUser = ['name','bio','location','website','phone','avatar_color','avatar_photo','following_privacy'];
  const keys = Object.keys(fields).filter(k => allowedUser.includes(k));
  if (!keys.length) return getUserById(id);
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE users SET ${setQuery}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map(k => fields[k]), id]
  );
  return rowToCamel(res.rows[0]);
}

async function adminUpdateUser(id, fields) {
  const VALID_PLANS = ['Starter', 'Pro', 'Elite'];
  const VALID_ROLES = ['user', 'admin'];

  // Validation et cast des types avant toute ecriture
  const sanitized = {};
  if (fields.name        !== undefined) sanitized.name         = String(fields.name).slice(0, 100);
  if (fields.bio         !== undefined) sanitized.bio          = String(fields.bio).slice(0, 500);
  if (fields.location    !== undefined) sanitized.location     = String(fields.location).slice(0, 100);
  if (fields.website     !== undefined) sanitized.website      = String(fields.website).slice(0, 200);
  if (fields.phone       !== undefined) sanitized.phone        = String(fields.phone).slice(0, 20);
  if (fields.avatar_color !== undefined) sanitized.avatar_color = String(fields.avatar_color).slice(0, 20);
  if (fields.avatar_photo !== undefined) sanitized.avatar_photo = String(fields.avatar_photo).slice(0, 2000000);
  if (fields.mm_phone    !== undefined) sanitized.mm_phone     = String(fields.mm_phone).slice(0, 20);
  if (fields.mm_operator !== undefined) sanitized.mm_operator  = String(fields.mm_operator).slice(0, 50);
  if (fields.mm_name     !== undefined) sanitized.mm_name      = String(fields.mm_name).slice(0, 100);
  if (fields.mm_accounts !== undefined) sanitized.mm_accounts  = Array.isArray(fields.mm_accounts) ? JSON.stringify(fields.mm_accounts) : '[]';
  if (fields.unlocked_courses !== undefined) sanitized.unlocked_courses = Array.isArray(fields.unlocked_courses) ? JSON.stringify(fields.unlocked_courses) : '[]';
  if (fields.plan        !== undefined) {
    if (!VALID_PLANS.includes(fields.plan)) throw new Error('PLAN_INVALIDE');
    sanitized.plan = fields.plan;
  }
  if (fields.role        !== undefined) {
    if (!VALID_ROLES.includes(fields.role)) throw new Error('ROLE_INVALIDE');
    sanitized.role = fields.role;
  }
  if (fields.earnings_ar !== undefined) sanitized.earnings_ar = Math.max(0, parseFloat(fields.earnings_ar) || 0);
  if (fields.pending_ar  !== undefined) sanitized.pending_ar  = Math.max(0, parseFloat(fields.pending_ar)  || 0);
  if (fields.paid_ar     !== undefined) sanitized.paid_ar     = Math.max(0, parseFloat(fields.paid_ar)     || 0);
  if (fields.refs        !== undefined) sanitized.refs        = Math.max(0, parseInt(fields.refs)          || 0);
  if (fields.is_active   !== undefined) sanitized.is_active   = fields.is_active === true || fields.is_active === 'true' || fields.is_active === 1;

  const keys = Object.keys(sanitized);
  if (!keys.length) return getUserById(id);
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE users SET ${setQuery}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map(k => sanitized[k]), id]
  );
  return rowToCamel(res.rows[0]);
}

async function deleteUser(id) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

// ═══════════════════════════════════════════════
// VIDEOS
// ═══════════════════════════════════════════════

async function createVideo(data) {
  const {
    title, desc, category, level, duration,
    free, accessType, price, unitPrice, videoSource,
    videoId, driveId, thumbnail, icon, moduleId, videoDescription
  } = data;

  const res = await query(
    `INSERT INTO videos
    (title, description, category, level, duration, free, access_type, price, unit_price, video_source, video_id, drive_id, thumbnail, icon, module_id, video_description, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
    RETURNING *`,
    [
      title,
      desc || '',
      category || 'debutant',
      level || 'Débutant',
      duration || '',
      free || false,
      accessType || 'pro',
      price || 0,
      unitPrice || null,
      videoSource || 'youtube',
      videoId || '',
      driveId || '',
      thumbnail || '',
      icon || 'fas fa-play-circle',
      moduleId || null,
      videoDescription || ''
    ]
  );

  return rowToCamel(res.rows[0]);
}

async function getVideos() {
  const res = await query('SELECT * FROM videos ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function getVideoById(id) {
  const res = await query('SELECT * FROM videos WHERE id = $1', [id]);
  return rowToCamel(res.rows[0]) || null;
}

async function deleteVideo(id) {
  await query('DELETE FROM videos WHERE id = $1', [id]);
}

// ═══════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════

async function createPost({ title, content, category, image, link, linkLabel, authorId, authorName, authorColor, authorPhoto }) {
  const res = await query(
    `INSERT INTO posts (title, content, category, image, link, link_label, author, author_id, author_color, author_photo, likes, comments, date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]','[]',NOW()) RETURNING *`,
    [
      title,
      content || '',
      category || 'Annonce',
      image || '',
      link || '',
      linkLabel || 'En savoir plus',
      authorName || 'Admin',
      authorId || null,
      authorColor || '#6c63ff',
      authorPhoto || ''
    ]
  );
  return rowToCamel(res.rows[0]);
}

async function getPostsByUser(authorId) {
  const [postsRes, usersRes] = await Promise.all([
    query('SELECT * FROM posts WHERE author_id = $1 ORDER BY COALESCE(created_at, date) DESC', [authorId]),
    query('SELECT id, avatar_photo FROM users')
  ]);
  const photoMap = {};
  for (const u of usersRes.rows) photoMap[u.id] = u.avatar_photo || '';
  return rowsToCamel(postsRes.rows).map(p => ({
    ...p,
    authorPhoto: p.authorId ? (photoMap[p.authorId] ?? p.authorPhoto ?? '') : (p.authorPhoto || ''),
    likes:    Array.isArray(p.likes)    ? p.likes    : [],
    comments: Array.isArray(p.comments) ? p.comments : [],
    date: p.createdAt ? new Date(p.createdAt).toISOString() : (p.date ? new Date(p.date).toISOString() : new Date().toISOString()),
  }));
}

async function getPosts() {
  const [postsRes, usersRes] = await Promise.all([
    query('SELECT * FROM posts ORDER BY COALESCE(created_at, date) DESC'),
    query('SELECT id, avatar_photo FROM users')
  ]);
  // Map userId -> avatarPhoto pour résolution en temps réel
  const photoMap = {};
  for (const u of usersRes.rows) photoMap[u.id] = u.avatar_photo || '';

  return rowsToCamel(postsRes.rows).map(p => ({
    ...p,
    // Résoudre la photo de l'auteur du post depuis users
    authorPhoto: p.authorId ? (photoMap[p.authorId] ?? p.authorPhoto ?? '') : (p.authorPhoto || ''),
    likes:    Array.isArray(p.likes)    ? p.likes    : [],
    comments: Array.isArray(p.comments) ? p.comments.filter(c => c && typeof c === 'object').map(c => ({
      ...c,
      author: c.author || c.authorName || '',
      // Résoudre la photo du commentateur depuis users
      authorPhoto: c.authorId ? (photoMap[c.authorId] ?? c.authorPhoto ?? '') : (c.authorPhoto || ''),
      replies: Array.isArray(c.replies) ? c.replies.filter(r => r && typeof r === 'object').map(r => ({
        ...r,
        author: r.author || r.authorName || '',
        // Résoudre la photo de l'auteur de la réponse depuis users
        authorPhoto: r.authorId ? (photoMap[r.authorId] ?? r.authorPhoto ?? '') : (r.authorPhoto || '')
      })) : []
    })) : [],
    date: p.createdAt
      ? new Date(p.createdAt).toISOString()
      : (p.date ? new Date(p.date).toISOString() : new Date().toISOString()),
  }));
}

async function getPostById(id) {
  const res = await query('SELECT * FROM posts WHERE id = $1', [id]);
  return rowToCamel(res.rows[0]) || null;
}

async function deletePost(id) {
  await query('DELETE FROM posts WHERE id = $1', [id]);
}

async function updatePost(id, { title, content, category, image, link, linkLabel }) {
  const fields = { title, content, category, image, link, link_label: linkLabel };
  const keys = Object.keys(fields).filter(k => fields[k] !== undefined);
  if (!keys.length) return getPostById(id);
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE posts SET ${setQuery} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map(k => fields[k]), id]
  );
  return rowToCamel(res.rows[0]);
}

async function toggleLike(postId, userEmail) {
  // Opération atomique : lecture + modification + écriture en une seule requête SQL
  // Élimine la race condition entre deux likes simultanés sur le même post
  const emailJson = JSON.stringify([userEmail]);
  const res = await query(
    `UPDATE posts
     SET likes = CASE
       WHEN COALESCE(likes, '[]'::jsonb) @> $1::jsonb THEN COALESCE(likes, '[]'::jsonb) - $2
       ELSE COALESCE(likes, '[]'::jsonb) || $1::jsonb
     END
     WHERE id = $3
     RETURNING likes`,
    [emailJson, userEmail, postId]
  );
  if (!res.rows.length) throw new Error('POST_NOT_FOUND');
  const likes = res.rows[0].likes || [];
  const liked = likes.includes(userEmail);
  return { liked, count: likes.length };
}

async function addComment(postId, { authorId, authorName, authorColor, authorPhoto, text }) {
  // Opération atomique : ajout du commentaire directement dans le JSONB
  // sans lecture préalable — élimine la race condition entre deux commentaires simultanés
  const comment = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    authorId, author: authorName, authorColor, authorPhoto,
    text, date: new Date().toISOString(), replies: []
  };
  const res = await query(
    `UPDATE posts
     SET comments = COALESCE(comments, '[]'::jsonb) || $1::jsonb
     WHERE id = $2
     RETURNING comments`,
    [JSON.stringify([comment]), postId]
  );
  if (!res.rows.length) throw new Error('POST_NOT_FOUND');
  return comment;
}

async function addReply(postId, commentId, { authorId, authorName, authorColor, authorPhoto, text, replyTo }) {
  // Lecture du post pour trouver l'index du commentaire cible
  // puis mise à jour atomique via jsonb_set sur le bon index
  const res = await query('SELECT comments FROM posts WHERE id = $1', [postId]);
  if (!res.rows.length) throw new Error('POST_NOT_FOUND');
  const comments = res.rows[0].comments || [];
  const idx = comments.findIndex(c => c.id === commentId);
  if (idx === -1) throw new Error('COMMENT_NOT_FOUND');

  const reply = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    authorId, author: authorName, authorColor, authorPhoto,
    text, replyTo, date: new Date().toISOString()
  };

  // jsonb_set met à jour uniquement le tableau replies du commentaire ciblé
  // sans réécrire tout le tableau comments — atomique au niveau de la ligne
  await query(
    `UPDATE posts
     SET comments = jsonb_set(
       comments,
       $1::text[],
       COALESCE(comments->$2->'replies', '[]'::jsonb) || $3::jsonb
     )
     WHERE id = $4`,
    [
      `{${idx},replies}`,
      idx,
      JSON.stringify([reply]),
      postId
    ]
  );
  return reply;
}

// ═══════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════

// Hook SSE — injecté depuis index.js
let _sseNotifyHook = null;
function setSseNotifyHook(fn) { _sseNotifyHook = fn; }

async function createNotification({ userId, type, message, link }) {
  const res = await query(
    `INSERT INTO notifications (user_id, type, message, link) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, type, message, link || '']
  );
  const notif = rowToCamel(res.rows[0]);
  if (_sseNotifyHook) _sseNotifyHook(userId, notif);
  return notif;
}

async function getNotifications(userId) {
  const res = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
  return rowsToCamel(res.rows);
}

async function countUnreadNotifications(userId) {
  const res = await query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false', [userId]);
  return parseInt(res.rows[0].count);
}

async function markNotificationsRead(userId) {
  await query('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
}

// ═══════════════════════════════════════════════
// COMMISSIONS
// ═══════════════════════════════════════════════

async function getCommissions(affiliateId) {
  const res = await query('SELECT * FROM commissions WHERE affiliate_id = $1 ORDER BY created_at DESC', [affiliateId]);
  return rowsToCamel(res.rows);
}

// ═══════════════════════════════════════════════
// RETRAITS
// ═══════════════════════════════════════════════

async function requestWithdraw({ userId, montant, phone, operator }) {
  const user = await getUserById(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  if (montant > user.earningsAr) throw new Error('SOLDE_INSUFFISANT');
  const res = await query(
    `INSERT INTO withdraws (user_id, montant, phone, operator) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, montant, phone || '', operator || '']
  );
  await query('UPDATE users SET earnings_ar = earnings_ar - $1, pending_ar = pending_ar + $1, updated_at = NOW() WHERE id = $2', [montant, userId]);
  return rowToCamel(res.rows[0]);
}

// ═══════════════════════════════════════════════
// ABONNEMENTS
// ═══════════════════════════════════════════════

async function createUpgradeRequest({ userId, userName, plan, amount, phone, operator, txRef, proof }) {
  const res = await query(
    `INSERT INTO upgrade_requests (user_id, user_name, plan, amount, phone, operator, tx_ref, proof)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, userName, plan, amount, phone || '', operator || '', txRef || '', proof || '']
  );
  return rowToCamel(res.rows[0]);
}

async function getUpgradeRequests() {
  const res = await query('SELECT * FROM upgrade_requests ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function updateUpgradeRequest(id, { statut, rejectReason }) {
  const res = await query(
    `UPDATE upgrade_requests SET statut = $1, reject_reason = $2, treated_at = NOW() WHERE id = $3 RETURNING *`,
    [statut, rejectReason || '', id]
  );
  const req = rowToCamel(res.rows[0]);
  if (!req) throw new Error('REQUEST_NOT_FOUND');
  if (statut === 'Approuvé') {
    await query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [req.plan, req.userId]);
  } else if (statut === 'Rejeté') {
    // Remettre le plan a Starter (depossession abonnement)
    await query("UPDATE users SET plan = 'Starter', updated_at = NOW() WHERE id = $1", [req.userId]);
    const reason = rejectReason ? ` Raison : ${rejectReason}` : '';
    await createNotification({ userId: req.userId, type: 'SUB_CANCELLED',
      message: `Votre abonnement ${req.plan} a ete annule. Votre compte est repasse en Starter. Vous devez soumettre une nouvelle demande de paiement pour retrouver l'acces.${reason}`,
      link: `dashboard.html?tab=subscription&sub=${req.id}` });
  }
  return req;
}

// ═══════════════════════════════════════════════
// ACHATS VIDÉO
// ═══════════════════════════════════════════════

async function createVideoPurchase({ userId, videoId, amount, phone, operator, mmName, txRef, proof }) {
  const user  = await getUserById(userId);
  const video = await getVideoById(videoId);
  const res = await query(
    `INSERT INTO video_purchases (user_id, user_name, video_id, video_title, amount, phone, operator, mm_name, tx_ref, proof)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [userId, user?.name || '', videoId, video?.title || '', amount, phone, operator, mmName || '', txRef || '', proof || '']
  );
  return rowToCamel(res.rows[0]);
}

async function getVideoPurchasesByUser(userId) {
  const res = await query('SELECT * FROM video_purchases WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rowsToCamel(res.rows);
}

async function getPendingVideoPurchases() {
  const res = await query('SELECT * FROM video_purchases ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function hasVideoPurchase(userId, videoId) {
  const res = await query(
    `SELECT id FROM video_purchases WHERE user_id = $1 AND video_id = $2 AND statut = 'Approuvé'`,
    [userId, videoId]
  );
  return res.rows.length > 0;
}

async function updateVideoPurchase(id, { statut, rejectReason }) {
  const res = await query(
    `UPDATE video_purchases SET statut = $1, reject_reason = $2, treated_at = NOW() WHERE id = $3 RETURNING *`,
    [statut, rejectReason || '', id]
  );
  const purchase = rowToCamel(res.rows[0]);
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND');

  if (statut === 'Approuvé') {
    await query(
      `UPDATE users SET unlocked_courses = unlocked_courses || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify([purchase.videoId]), purchase.userId]
    );
    await createNotification({
      userId: purchase.userId,
      type: 'FORMATION_UNLOCKED',
      message: `Votre achat de "${purchase.videoTitle}" a été approuvé ! La formation est maintenant accessible.`,
      link: 'formations.html'
    });
  } else if (statut === 'Rejeté') {
    await query(
      `UPDATE users SET unlocked_courses = (
        SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(unlocked_courses,'[]'::jsonb)) AS val
        WHERE val::int != $1
      ), updated_at = NOW() WHERE id = $2`,
      [purchase.videoId, purchase.userId]
    );
    const reason = rejectReason ? ` Raison : ${rejectReason}` : '';
    await createNotification({
      userId: purchase.userId,
      type: 'FORMATION_REJECTED',
      message: `Votre accès à la vidéo "${purchase.videoTitle}" a été révoqué. Vous devez repayer pour y accéder.${reason}`,
      link: 'formations.html'
    });
  }
  return purchase;
}

async function getVideoModules() {
  const res = await query('SELECT * FROM video_modules ORDER BY position ASC, created_at ASC');
  return rowsToCamel(res.rows);
}

async function createVideoModule({ title, description, icon, color, position }) {
  const res = await query(
    `INSERT INTO video_modules (title, description, icon, color, position) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [title, description || '', icon || 'fas fa-layer-group', color || '#6c63ff', position || 0]
  );
  return rowToCamel(res.rows[0]);
}

async function updateVideoModule(id, { title, description, icon, color, position, modulePrice }) {
  const fields = { title, description, icon, color, position, module_price: modulePrice };
  const keys = Object.keys(fields).filter(k => fields[k] !== undefined);
  if (!keys.length) return getVideoModules();
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE video_modules SET ${setQuery} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map(k => fields[k]), id]
  );
  return rowToCamel(res.rows[0]);
}

async function deleteVideoModule(id) {
  await query('DELETE FROM video_modules WHERE id = $1', [id]);
}

// ═══════════════════════════════════════════════
// ACHATS MODULE
// ═══════════════════════════════════════════════

async function createModulePurchase({ userId, moduleId, amount, phone, operator, mmName, txRef, proof }) {
  const user   = await getUserById(userId);
  const modRes = await query('SELECT * FROM video_modules WHERE id = $1', [moduleId]);
  const mod    = modRes.rows[0];
  const res = await query(
    `INSERT INTO module_purchases (user_id, user_name, module_id, module_title, amount, phone, operator, mm_name, tx_ref, proof)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [userId, user?.name || '', moduleId, mod?.title || '', amount, phone, operator, mmName || '', txRef || '', proof || '']
  );
  return rowToCamel(res.rows[0]);
}

async function getModulePurchasesByUser(userId) {
  const res = await query('SELECT * FROM module_purchases WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rowsToCamel(res.rows);
}

async function getAllModulePurchases() {
  const res = await query('SELECT * FROM module_purchases ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function hasModulePurchase(userId, moduleId) {
  const res = await query(
    `SELECT id FROM module_purchases WHERE user_id = $1 AND module_id = $2 AND statut = 'Approuvé'`,
    [userId, moduleId]
  );
  return res.rows.length > 0;
}

async function updateModulePurchase(id, { statut, rejectReason }) {
  const res = await query(
    `UPDATE module_purchases SET statut = $1, reject_reason = $2, treated_at = NOW() WHERE id = $3 RETURNING *`,
    [statut, rejectReason || '', id]
  );
  const purchase = rowToCamel(res.rows[0]);
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND');

  if (statut === 'Approuvé') {
    const videos = await query('SELECT id FROM videos WHERE module_id = $1', [purchase.moduleId]);
    const videoIds = videos.rows.map(v => v.id);
    if (videoIds.length) {
      await query(
        `UPDATE users SET unlocked_courses = (
          SELECT jsonb_agg(DISTINCT val)
          FROM jsonb_array_elements(COALESCE(unlocked_courses,'[]'::jsonb) || $1::jsonb) AS val
        ), updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(videoIds), purchase.userId]
      );
    }
    await createNotification({
      userId: purchase.userId,
      type: 'FORMATION_UNLOCKED',
      message: `Votre achat du module "${purchase.moduleTitle}" a été approuvé ! Toutes les vidéos sont accessibles.`,
      link: 'formations.html'
    });
  } else if (statut === 'Rejeté') {
    const videos = await query('SELECT id FROM videos WHERE module_id = $1', [purchase.moduleId]);
    const videoIds = videos.rows.map(v => v.id);
    if (videoIds.length) {
      await query(
        `UPDATE users SET unlocked_courses = (
          SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
          FROM jsonb_array_elements(COALESCE(unlocked_courses,'[]'::jsonb)) AS val
          WHERE val::int NOT IN (SELECT unnest($1::int[]))
        ), updated_at = NOW() WHERE id = $2`,
        [videoIds, purchase.userId]
      );
    }
    const reason = rejectReason ? ` Raison : ${rejectReason}` : '';
    await createNotification({
      userId: purchase.userId,
      type: 'FORMATION_REJECTED',
      message: `Votre accès au module "${purchase.moduleTitle}" a été révoqué. Toutes les vidéos sont de nouveau inaccessibles. Vous devez repayer pour y accéder.${reason}`,
      link: 'formations.html'
    });
  }
  return purchase;
}

async function updateVideo(id, fields) {
  // Convertir camelCase -> snake_case pour les champs envoyés par le frontend
  const camelToSnake = {
    desc:             'description',
    accessType:       'access_type',
    unitPrice:        'unit_price',
    videoSource:      'video_source',
    videoId:          'video_id',
    driveId:          'drive_id',
    moduleId:         'module_id',
    videoDescription: 'video_description',
  };
  const normalized = {};
  for (const k of Object.keys(fields)) {
    const snakeKey = camelToSnake[k] || k;
    normalized[snakeKey] = fields[k];
  }

  const allowed = ['title','description','category','level','duration','free','access_type',
    'price','unit_price','video_source','video_id','drive_id','thumbnail','icon','module_id','video_description'];
  const keys = Object.keys(normalized).filter(k => allowed.includes(k));
  if (!keys.length) return getVideoById(id);
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE videos SET ${setQuery} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map(k => normalized[k]), id]
  );
  return rowToCamel(res.rows[0]);
}

// ═══════════════════════════════════════════════
// COMPTES PAIEMENT
// ═══════════════════════════════════════════════

async function getPaymentAccounts() {
  const res = await query('SELECT * FROM payment_accounts ORDER BY operator');
  return rowsToCamel(res.rows);
}

async function updatePaymentAccount(operator, fields) {
  const keys = Object.keys(fields).filter(k => ['phone','name','color'].includes(k));
  if (!keys.length) return getPaymentAccounts();
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const colNames = keys.join(', ');
  const colValues = keys.map((_, i) => `$${i + 1}`).join(', ');
  await query(
    `INSERT INTO payment_accounts (operator, ${colNames}) VALUES ($${keys.length + 1}, ${colValues})
     ON CONFLICT (operator) DO UPDATE SET ${setQuery}`,
    [...keys.map(k => fields[k]), operator]
  );
  return getPaymentAccounts();
}

async function togglePaymentAccount(operator, { disabled, disabledReason }) {
  await query(
    `INSERT INTO payment_accounts (operator, disabled, disabled_reason, disabled_at)
     VALUES ($1,$2,$3, CASE WHEN $2 THEN NOW() ELSE NULL END)
     ON CONFLICT (operator) DO UPDATE SET disabled = $2, disabled_reason = $3, disabled_at = CASE WHEN $2 THEN NOW() ELSE NULL END`,
    [operator, !!disabled, disabledReason || '']
  );
  return getPaymentAccounts();
}

async function clearPaymentAccount(operator) {
  await query(`UPDATE payment_accounts SET phone = '', name = '' WHERE operator = $1`, [operator]);
  return getPaymentAccounts();
}

// ═══════════════════════════════════════════════
// TARIFS
// ═══════════════════════════════════════════════

async function getPricing() {
  const res = await query('SELECT * FROM pricing WHERE id = 1');
  return rowToCamel(res.rows[0]) || {};
}

async function updatePricing(fields) {
  const allowed = ['pro','elite','video','withdraw_min','comm_starter','comm_pro','comm_elite',
    'withdrawMin','commStarter','commPro','commElite'];
  // Normaliser camelCase -> snake_case avant insertion
  const normalized = {};
  const camelToSnake = { withdrawMin: 'withdraw_min', commStarter: 'comm_starter', commPro: 'comm_pro', commElite: 'comm_elite' };
  for (const k of Object.keys(fields)) {
    const mapped = camelToSnake[k] || k;
    if (allowed.includes(mapped) || allowed.includes(k)) normalized[mapped] = fields[k];
  }
  const keys = Object.keys(normalized).filter(k => allowed.includes(k));
  if (!keys.length) return getPricing();
  const setQuery = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE pricing SET ${setQuery}, updated_at = NOW() WHERE id = 1 RETURNING *`,
    keys.map(k => typeof normalized[k] === 'object' ? JSON.stringify(normalized[k]) : normalized[k])
  );
  return rowToCamel(res.rows[0]);
}

// ═══════════════════════════════════════════════
// UTILISATEURS — fonctions supplémentaires
// ═══════════════════════════════════════════════

async function addMmAccount(userId, { operator, phone, name }) {
  const user = await getUserById(userId);
  if (!user) throw new Error('USER_NOT_FOUND');

  // Récupérer les comptes existants
  let accounts = user.mmAccounts || [];

  // Migration : si mmAccounts est vide mais mm_phone existe, l'intégrer d'abord
  if (!accounts.length && user.mmPhone) {
    accounts = [{
      operator: user.mmOperator || 'MVola',
      phone: user.mmPhone,
      name: user.mmName || user.name
    }];
  }

  // Ajouter ou mettre à jour l'opérateur demandé
  const existing = accounts.findIndex(a => a.operator === operator);
  if (existing >= 0) {
    accounts[existing] = { operator, phone, name };
  } else {
    accounts.push({ operator, phone, name });
  }

  const res = await query(
    'UPDATE users SET mm_accounts = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [JSON.stringify(accounts), userId]
  );
  return rowToCamel(res.rows[0]);
}

async function changePassword(userId, oldPassword, newPassword) {
  const res = await query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!res.rows.length) throw new Error('USER_NOT_FOUND');
  const user = rowToCamel(res.rows[0]);
  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) throw new Error('WRONG_PASSWORD');
  if (newPassword.length < 6) throw new Error('MOT_DE_PASSE_TROP_COURT');
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
}

// ═══════════════════════════════════════════════
// STATS ADMIN
// ═══════════════════════════════════════════════

async function getAdminStats() {
  const [members, pro, elite, starter, pendingW, recentRes] = await Promise.all([
    query(`SELECT COUNT(*) FROM users WHERE role != 'admin'`),
    query(`SELECT COUNT(*) FROM users WHERE plan = 'Pro'`),
    query(`SELECT COUNT(*) FROM users WHERE plan = 'Elite'`),
    query(`SELECT COUNT(*) FROM users WHERE plan = 'Starter' AND role != 'admin'`),
    query(`SELECT COALESCE(SUM(montant),0) AS total FROM withdraws WHERE statut = 'En attente'`),
    query(`SELECT id, name, email, plan, avatar_color, avatar_photo, is_active, created_at
           FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT 10`),
  ]);

  const totalMembers   = parseInt(members.rows[0].count);
  const proMembers     = parseInt(pro.rows[0].count);
  const eliteMembers   = parseInt(elite.rows[0].count);
  const starterMembers = parseInt(starter.rows[0].count);

  // usersSubscribed = Pro + Elite
  const usersSubscribed = proMembers + eliteMembers;
  // usersActive = membres avec un plan Pro ou Elite (abonnes actifs)
  const usersActive = usersSubscribed;
  // usersWithCourse = membres ayant au moins 1 cours debloque
  const withCourse = await query(
    `SELECT COUNT(DISTINCT id) FROM users WHERE role != 'admin' AND jsonb_array_length(unlocked_courses) > 0`
  );
  const usersWithCourse = parseInt(withCourse.rows[0].count);

  // totalRevenueAR = somme des earnings_ar de tous les membres
  const revenue = await query(`SELECT COALESCE(SUM(earnings_ar),0) AS total FROM users WHERE role != 'admin'`);
  const totalRevenueAR = parseFloat(revenue.rows[0].total);

  const recentUsers = rowsToCamel(recentRes.rows);

  return {
    totalMembers,
    proMembers,
    eliteMembers,
    starterMembers,
    usersSubscribed,
    usersActive,
    usersWithCourse,
    totalRevenueAR,
    pendingWithdraws: parseFloat(pendingW.rows[0].total),
    recentUsers,
  };
}

// ═══════════════════════════════════════════════
// FOLLOWS
// ═══════════════════════════════════════════════

async function followUser(followerId, followingId) {
  if (followerId === followingId) throw new Error('CANNOT_FOLLOW_SELF');
  await query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [followerId, followingId]
  );
}

async function unfollowUser(followerId, followingId) {
  await query(
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
}

async function isFollowing(followerId, followingId) {
  const res = await query(
    `SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
  return res.rows.length > 0;
}

async function getFollowers(userId) {
  const res = await query(
    `SELECT u.id, u.name, u.avatar_color, u.avatar_photo, u.plan, f.created_at
     FROM follows f
     JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rowsToCamel(res.rows);
}

async function getFollowing(userId) {
  const res = await query(
    `SELECT u.id, u.name, u.avatar_color, u.avatar_photo, u.plan, f.created_at
     FROM follows f
     JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return rowsToCamel(res.rows);
}

async function countFollowers(userId) {
  const res = await query(`SELECT COUNT(*) FROM follows WHERE following_id = $1`, [userId]);
  return parseInt(res.rows[0].count);
}

async function countFollowing(userId) {
  const res = await query(`SELECT COUNT(*) FROM follows WHERE follower_id = $1`, [userId]);
  return parseInt(res.rows[0].count);
}

// ═══════════════════════════════════════════════
// MESSAGES PRIVÉS
// ═══════════════════════════════════════════════


async function sendPrivateMessage(senderId, receiverId, content, image, replyToId) {
  const res = await query(
    `INSERT INTO private_messages (sender_id, receiver_id, content, image, read, read_at, reply_to_id)
     VALUES ($1,$2,$3,$4, false, NULL, $5) RETURNING *`,
    [senderId, receiverId, content, image || '', replyToId || null]
  );
  return rowToCamel(res.rows[0]);
}

async function getPrivateMessages(userId, otherId, limit, before) {
  const lim = parseInt(limit) || 30;
  const params = [userId, otherId];
  let whereExtra = '';
  if (before) {
    params.push(before);
    whereExtra = `AND m.created_at < $${params.length}`;
  }
  const res = await query(
    `SELECT m.*,
       r.id        AS reply_id,
       r.content   AS reply_content,
       r.sender_id AS reply_sender_id,
       rs.name     AS reply_sender_name
     FROM private_messages m
     LEFT JOIN private_messages r  ON r.id = m.reply_to_id
     LEFT JOIN users rs            ON rs.id = r.sender_id
     WHERE (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
     ${whereExtra}
     ORDER BY m.created_at DESC
     LIMIT ${lim}`,
    params
  );
  await query(
    `UPDATE private_messages SET read = true, read_at = NOW()
     WHERE receiver_id = $1 AND sender_id = $2 AND read = false`,
    [userId, otherId]
  );
  const rows = res.rows.map(row => {
    const base = rowToCamel(row);
    if (row.reply_id) {
      base.replyTo = {
        id:         row.reply_id,
        content:    row.reply_content,
        senderId:   row.reply_sender_id,
        senderName: row.reply_sender_name || ''
      };
    }
    return base;
  });
  rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return rows;
}

async function getConversations(userId) {
  const res = await query(
    `SELECT
       u.id, u.name, u.avatar_color, u.avatar_photo,
       last_msg.content AS last_content,
       last_msg.image AS last_image,
       last_msg.created_at AS last_date,
       last_msg.sender_id AS last_sender_id,
       (SELECT COUNT(*) FROM private_messages
        WHERE receiver_id = $1 AND sender_id = u.id AND read = false) AS unread_count,
       last_rx.emoji AS last_rx_emoji,
       last_rx.user_id AS last_rx_user_id,
       last_rx.created_at AS last_rx_date,
       last_rx.msg_content AS last_rx_msg_content,
       last_rx.msg_sender_id AS last_rx_msg_sender_id
     FROM users u
     JOIN LATERAL (
       SELECT content, image, created_at, sender_id FROM private_messages
       WHERE (sender_id = $1 AND receiver_id = u.id)
          OR (sender_id = u.id AND receiver_id = $1)
       ORDER BY created_at DESC LIMIT 1
     ) last_msg ON true
     LEFT JOIN LATERAL (
       SELECT r.emoji, r.user_id, r.created_at, m.content AS msg_content, m.sender_id AS msg_sender_id
       FROM message_reactions r
       JOIN private_messages m ON m.id = r.message_id
       WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
          OR (m.sender_id = u.id AND m.receiver_id = $1)
       ORDER BY r.created_at DESC LIMIT 1
     ) last_rx ON true
     ORDER BY last_msg.created_at DESC`,
    [userId]
  );
  return rowsToCamel(res.rows);
}


async function markMessagesRead(receiverId, senderId) {
  await query(
    `UPDATE private_messages SET read = true, read_at = NOW()
     WHERE receiver_id = $1 AND sender_id = $2 AND read = false`,
    [receiverId, senderId]
  );
}

async function countUnreadMessages(userId) {
  const res = await query(
    `SELECT COUNT(*) FROM private_messages WHERE receiver_id = $1 AND read = false`,
    [userId]
  );
  return parseInt(res.rows[0].count);
}

async function deletePrivateMessage(msgId, senderId) {
  const res = await query(
    `DELETE FROM private_messages WHERE id = $1 AND sender_id = $2 RETURNING id`,
    [msgId, senderId]
  );
  return res.rowCount > 0;
}

async function updateLastSeen(userId, ts) {
  await query(
    `UPDATE users SET last_seen = $1 WHERE id = $2`,
    [ts, userId]
  ).catch(() => {});
}

async function getLastSeen(userId) {
  try {
    const res = await query('SELECT last_seen FROM users WHERE id = $1', [userId]);
    return res.rows[0] ? res.rows[0].last_seen : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════
// PARTAGES FACEBOOK
// ═══════════════════════════════════════════════

async function recordShare({ postId, userId, refCode }) {
  await query(
    `INSERT INTO post_shares (post_id, user_id, ref_code) VALUES ($1,$2,$3)`,
    [postId, userId, refCode || '']
  );
}

async function getShareStats() {
  const res = await query(
    `SELECT ps.post_id, p.title, u.name AS user_name, ps.ref_code, ps.created_at
     FROM post_shares ps
     LEFT JOIN posts p ON p.id = ps.post_id
     LEFT JOIN users u ON u.id = ps.user_id
     ORDER BY ps.created_at DESC
     LIMIT 100`
  );
  return rowsToCamel(res.rows);
}

// ═══════════════════════════════════════════════
// NAVBAR BUTTON
// ═══════════════════════════════════════════════

async function getSocialLinks() {
  const res = await query('SELECT * FROM social_links WHERE id = 1');
  return res.rows[0] || { facebook: '', tiktok: '', telegram: '', youtube: '' };
}

async function setSocialLinks({ facebook, tiktok, telegram, youtube }) {
  await query(
    `INSERT INTO social_links (id, facebook, tiktok, telegram, youtube)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET facebook=$1, tiktok=$2, telegram=$3, youtube=$4`,
    [facebook || '', tiktok || '', telegram || '', youtube || '']
  );
}

async function getNavbarButton() {
  const res = await query('SELECT * FROM navbar_button WHERE id = 1');
  return res.rows[0] || { enabled: false, label: '', icon_url: '', link: '' };
}

async function setNavbarButton({ enabled, label, icon_url, link }) {
  await query(
    `INSERT INTO navbar_button (id, enabled, label, icon_url, link)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET enabled=$1, label=$2, icon_url=$3, link=$4`,
    [!!enabled, label || '', icon_url || '', link || '']
  );
}

// ═══════════════════════════════════════════════
// EBOOKS
// ═══════════════════════════════════════════════

async function getEbooks() {
  const res = await query('SELECT * FROM ebooks WHERE is_active = true ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function getAllEbooksAdmin() {
  const res = await query('SELECT * FROM ebooks ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function getEbookById(id) {
  const res = await query('SELECT * FROM ebooks WHERE id = $1', [id]);
  return rowToCamel(res.rows[0]) || null;
}

async function createEbook({ title, description, cover, price, category, pages, author, fileUrl }) {
  const res = await query(
    `INSERT INTO ebooks (title, description, cover, price, category, pages, author, file_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [title, description || '', cover || '', price || 0, category || 'General', pages || null, author || '', fileUrl || '']
  );
  return rowToCamel(res.rows[0]);
}

async function updateEbook(id, fields) {
  const allowed = { title: 'title', description: 'description', cover: 'cover', price: 'price',
    category: 'category', pages: 'pages', author: 'author', fileUrl: 'file_url', isActive: 'is_active' };
  const keys = Object.keys(fields).filter(k => allowed[k] !== undefined);
  if (!keys.length) return getEbookById(id);
  const setQuery = keys.map((k, i) => `${allowed[k]} = $${i + 1}`).join(', ');
  const res = await query(
    `UPDATE ebooks SET ${setQuery} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map(k => fields[k]), id]
  );
  return rowToCamel(res.rows[0]);
}

async function deleteEbook(id) {
  await query('DELETE FROM ebooks WHERE id = $1', [id]);
}

async function createEbookPurchase({ userId, ebookId, amount, phone, operator, mmName, txRef, proof }) {
  const user  = await getUserById(userId);
  const ebook = await getEbookById(ebookId);
  const res = await query(
    `INSERT INTO ebook_purchases (user_id, user_name, ebook_id, ebook_title, amount, phone, operator, mm_name, tx_ref, proof)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [userId, user?.name || '', ebookId, ebook?.title || '', amount, phone || '', operator || '', mmName || '', txRef || '', proof || '']
  );
  return rowToCamel(res.rows[0]);
}

async function getEbookPurchasesByUser(userId) {
  const res = await query(
    `SELECT ep.*, e.file_url, e.cover FROM ebook_purchases ep
     LEFT JOIN ebooks e ON e.id = ep.ebook_id
     WHERE ep.user_id = $1 ORDER BY ep.created_at DESC`,
    [userId]
  );
  return rowsToCamel(res.rows);
}

async function getAllEbookPurchases() {
  const res = await query('SELECT * FROM ebook_purchases ORDER BY created_at DESC');
  return rowsToCamel(res.rows);
}

async function hasEbookPurchase(userId, ebookId) {
  const res = await query(
    `SELECT id FROM ebook_purchases WHERE user_id = $1 AND ebook_id = $2 AND statut = 'Approuvé'`,
    [userId, ebookId]
  );
  return res.rows.length > 0;
}

async function updateEbookPurchase(id, { statut, rejectReason }) {
  const res = await query(
    `UPDATE ebook_purchases SET statut = $1, reject_reason = $2, treated_at = NOW() WHERE id = $3 RETURNING *`,
    [statut, rejectReason || '', id]
  );
  const purchase = rowToCamel(res.rows[0]);
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND');
  if (statut === 'Approuvé') {
    await createNotification({
      userId: purchase.userId, type: 'FORMATION_UNLOCKED',
      message: `Votre achat de l'ebook "${purchase.ebookTitle}" a été approuvé ! Vous pouvez maintenant le télécharger.`,
      link: 'ebooks.html'
    });
  } else if (statut === 'Rejeté') {
    const reason = rejectReason ? ` Raison : ${rejectReason}` : '';
    await createNotification({
      userId: purchase.userId, type: 'FORMATION_REJECTED',
      message: `Votre achat de l'ebook "${purchase.ebookTitle}" a été rejeté.${reason}`,
      link: 'ebooks.html'
    });
  }
  return purchase;
}

// ═══════════════════════════════════════════════
// RÉACTIONS POSTS
// ═══════════════════════════════════════════════

async function togglePostReaction(postId, userId, emoji) {
  const ALLOWED = ['❤️','😂','😮','😢','😡','👍'];
  if (!ALLOWED.includes(emoji)) throw new Error('EMOJI_INVALIDE');
  const existing = await query(
    'SELECT id, emoji FROM post_reactions WHERE post_id=$1 AND user_id=$2',
    [postId, userId]
  );
  if (existing.rows.length) {
    if (existing.rows[0].emoji === emoji) {
      await query('DELETE FROM post_reactions WHERE post_id=$1 AND user_id=$2', [postId, userId]);
      return { action: 'removed', emoji };
    }
    await query('UPDATE post_reactions SET emoji=$1, created_at=NOW() WHERE post_id=$2 AND user_id=$3', [emoji, postId, userId]);
    return { action: 'changed', emoji };
  }
  await query('INSERT INTO post_reactions (post_id, user_id, emoji) VALUES ($1,$2,$3)', [postId, userId, emoji]);
  return { action: 'added', emoji };
}

async function getPostReactions(postId) {
  const res = await query('SELECT emoji, user_id FROM post_reactions WHERE post_id=$1', [postId]);
  const grouped = {};
  for (const row of res.rows) {
    if (!grouped[row.emoji]) grouped[row.emoji] = [];
    grouped[row.emoji].push(row.user_id);
  }
  return grouped;
}

async function getPostsReactionsBatch(postIds) {
  if (!postIds.length) return {};
  const res = await query(
    'SELECT post_id, emoji, user_id FROM post_reactions WHERE post_id = ANY($1)',
    [postIds]
  );
  const result = {};
  for (const row of res.rows) {
    if (!result[row.post_id]) result[row.post_id] = {};
    if (!result[row.post_id][row.emoji]) result[row.post_id][row.emoji] = [];
    result[row.post_id][row.emoji].push(row.user_id);
  }
  return result;
}

// ═══════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════

function generateRefCode() {
  return 'PAG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ═══════════════════════════════════════════════

module.exports = {
  createUser,
  login,
  getUserById,
  getAllUsers,
  updateUser,
  adminUpdateUser,
  deleteUser,

  createVideo,
  getVideos,
  getVideoById,
  deleteVideo,

  createPost,
  getPosts,
  getPostsByUser,
  getPostById,
  deletePost,
  updatePost,
  toggleLike,
  addComment,
  addReply,

  createNotification,
  getNotifications,
  countUnreadNotifications,
  markNotificationsRead,
  setSseNotifyHook,

  getCommissions,
  requestWithdraw,

  createUpgradeRequest,
  getUpgradeRequests,
  updateUpgradeRequest,

  createVideoPurchase,
  getVideoPurchasesByUser,
  getPendingVideoPurchases,
  hasVideoPurchase,
  updateVideoPurchase,

  updateVideo,

  getVideoModules,
  createVideoModule,
  updateVideoModule,
  deleteVideoModule,

  createModulePurchase,
  getModulePurchasesByUser,
  getAllModulePurchases,
  hasModulePurchase,
  updateModulePurchase,

  getPaymentAccounts,
  updatePaymentAccount,
  togglePaymentAccount,
  clearPaymentAccount,

  getPricing,
  updatePricing,

  addMmAccount,
  changePassword,

  getAdminStats,

  sendPrivateMessage,
  getConversations,
  getPrivateMessages,
  markMessagesRead,
  countUnreadMessages,
  deletePrivateMessage,

  updateLastSeen,
  getLastSeen,

  followUser,
  unfollowUser,
  isFollowing,
  getFollowers,
  getFollowing,
  countFollowers,
  countFollowing,

  getNavbarButton,
  setNavbarButton,

  getSocialLinks,
  setSocialLinks,

  recordShare,
  getShareStats,

  getEbooks,
  getAllEbooksAdmin,
  getEbookById,
  createEbook,
  updateEbook,
  deleteEbook,
  createEbookPurchase,
  getEbookPurchasesByUser,
  getAllEbookPurchases,
  hasEbookPurchase,
  updateEbookPurchase,

  togglePostReaction,
  getPostReactions,
  getPostsReactionsBatch,
};
