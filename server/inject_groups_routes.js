// Injecte les routes groupes dans index.js
// Exécuter depuis server/ : node inject_groups_routes.js

const fs   = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.js');
let src = fs.readFileSync(indexPath, 'utf8');

const ANCHOR = "app.listen(PORT, '0.0.0.0', async () => {";

if (!src.includes(ANCHOR)) {
  console.error('❌ Ancre introuvable dans index.js');
  process.exit(1);
}

if (src.includes('// ══ GROUPES DE DISCUSSION ══')) {
  console.log('⚠️  Routes groupes déjà présentes — rien à faire.');
  process.exit(0);
}

const ROUTES = `
// ══ GROUPES DE DISCUSSION ══════════════════════════════════════════════════

// Helper : vérifier si l'utilisateur est membre du groupe
async function _isGroupMember(groupId, userId) {
  const r = await _migPool.query(
    'SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2',
    [groupId, userId]
  );
  return r.rows[0] || null;
}

// Helper : notifier tous les membres d'un groupe via SSE
function _notifyGroupMembers(groupId, members, payload) {
  const data = 'data: ' + JSON.stringify(payload) + '\\n\\n';
  members.forEach(m => {
    const clients = _sseClients.get(m.user_id);
    if (clients) clients.forEach(c => { try { c.write(data); } catch(e) {} });
  });
}

// POST /api/groups — créer un groupe
app.post('/api/groups', requireAuth, async (req, res) => {
  const { name, photo, memberIds } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'NOM_REQUIS' });
  try {
    const r = await _migPool.query(
      'INSERT INTO groups (name, photo, created_by) VALUES ($1,$2,$3) RETURNING *',
      [name.trim().slice(0, 100), photo || '', req.user.id]
    );
    const group = r.rows[0];
    // Ajouter le créateur comme admin
    await _migPool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3)',
      [group.id, req.user.id, 'admin']
    );
    // Ajouter les membres invités
    const ids = Array.isArray(memberIds) ? memberIds.filter(id => id !== req.user.id) : [];
    for (const uid of ids) {
      await _migPool.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [group.id, uid, 'member']
      );
    }
    res.json({ ...group, role: 'admin' });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// GET /api/groups — mes groupes
app.get('/api/groups', requireAuth, async (req, res) => {
  try {
    const r = await _migPool.query(\`
      SELECT g.*, gm.role,
        (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count,
        (SELECT content FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
        (SELECT COUNT(*) FROM group_messages gms
          WHERE gms.group_id = g.id
          AND NOT EXISTS (SELECT 1 FROM group_message_reads gmr WHERE gmr.message_id = gms.id AND gmr.user_id = $1)
          AND gms.sender_id != $1
        ) AS unread_count
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
      ORDER BY COALESCE(last_message_at, g.created_at) DESC
    \`, [req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// GET /api/groups/:id — détails + membres
app.get('/api/groups/:id', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  if (!gid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member) return res.status(403).json({ error: 'NON_MEMBRE' });
    const [gRes, mRes] = await Promise.all([
      _migPool.query('SELECT * FROM groups WHERE id=$1', [gid]),
      _migPool.query(\`
        SELECT gm.user_id, gm.role, gm.joined_at,
               u.name, u.avatar_photo, u.avatar_color
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY gm.role DESC, gm.joined_at ASC
      \`, [gid])
    ]);
    if (!gRes.rows[0]) return res.status(404).json({ error: 'GROUPE_INTROUVABLE' });
    res.json({ ...gRes.rows[0], role: member.role, members: mRes.rows });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// PUT /api/groups/:id — modifier nom/photo (admin groupe uniquement)
app.put('/api/groups/:id', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  if (!gid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member || member.role !== 'admin') return res.status(403).json({ error: 'ADMIN_GROUPE_REQUIS' });
    const { name, photo } = req.body;
    const fields = [];
    const vals   = [];
    if (name  !== undefined) { fields.push('name=$' + (fields.length+1));  vals.push(name.trim().slice(0,100)); }
    if (photo !== undefined) { fields.push('photo=$' + (fields.length+1)); vals.push(photo); }
    if (!fields.length) return res.status(400).json({ error: 'RIEN_A_MODIFIER' });
    fields.push('updated_at=NOW()');
    vals.push(gid);
    const r = await _migPool.query(
      \`UPDATE groups SET \${fields.join(',')} WHERE id=$\${vals.length} RETURNING *\`,
      vals
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// DELETE /api/groups/:id — supprimer (créateur uniquement)
app.delete('/api/groups/:id', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  if (!gid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const g = await _migPool.query('SELECT created_by FROM groups WHERE id=$1', [gid]);
    if (!g.rows[0]) return res.status(404).json({ error: 'GROUPE_INTROUVABLE' });
    if (g.rows[0].created_by !== req.user.id) return res.status(403).json({ error: 'CREATEUR_REQUIS' });
    await _migPool.query('DELETE FROM groups WHERE id=$1', [gid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST /api/groups/:id/members — ajouter un membre (admin groupe)
app.post('/api/groups/:id/members', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  const uid = parseId(req.body.userId);
  if (!gid || !uid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member || member.role !== 'admin') return res.status(403).json({ error: 'ADMIN_GROUPE_REQUIS' });
    await _migPool.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [gid, uid, 'member']
    );
    // Notifier le nouveau membre
    const adder = await db.getUserById(req.user.id);
    const group = await _migPool.query('SELECT name FROM groups WHERE id=$1', [gid]);
    await db.createNotification({
      userId: uid, type: 'GROUP_INVITE',
      message: \`\${adder.name} vous a ajouté au groupe "\${group.rows[0]?.name}"\`,
      link: 'messages.html?tab=groups&group=' + gid
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// DELETE /api/groups/:id/members/:userId — retirer un membre (admin groupe)
app.delete('/api/groups/:id/members/:userId', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  const uid = parseId(req.params.userId);
  if (!gid || !uid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member || member.role !== 'admin') return res.status(403).json({ error: 'ADMIN_GROUPE_REQUIS' });
    // Ne pas retirer le créateur
    const g = await _migPool.query('SELECT created_by FROM groups WHERE id=$1', [gid]);
    if (g.rows[0]?.created_by === uid) return res.status(403).json({ error: 'IMPOSSIBLE_RETIRER_CREATEUR' });
    await _migPool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [gid, uid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// PATCH /api/groups/:id/members/:userId/role — promouvoir/rétrograder (créateur uniquement)
app.patch('/api/groups/:id/members/:userId/role', requireAuth, async (req, res) => {
  const gid  = parseId(req.params.id);
  const uid  = parseId(req.params.userId);
  const role = req.body.role;
  if (!gid || !uid) return res.status(400).json({ error: 'ID_INVALIDE' });
  if (!['admin','member'].includes(role)) return res.status(400).json({ error: 'ROLE_INVALIDE' });
  try {
    const g = await _migPool.query('SELECT created_by FROM groups WHERE id=$1', [gid]);
    if (!g.rows[0]) return res.status(404).json({ error: 'GROUPE_INTROUVABLE' });
    if (g.rows[0].created_by !== req.user.id) return res.status(403).json({ error: 'CREATEUR_REQUIS' });
    await _migPool.query(
      'UPDATE group_members SET role=$1 WHERE group_id=$2 AND user_id=$3',
      [role, gid, uid]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST /api/groups/:id/leave — quitter le groupe
app.post('/api/groups/:id/leave', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  if (!gid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const g = await _migPool.query('SELECT created_by FROM groups WHERE id=$1', [gid]);
    if (!g.rows[0]) return res.status(404).json({ error: 'GROUPE_INTROUVABLE' });
    if (g.rows[0].created_by === req.user.id) return res.status(400).json({ error: 'CREATEUR_NE_PEUT_PAS_QUITTER' });
    await _migPool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [gid, req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// GET /api/groups/:id/messages — messages paginés
app.get('/api/groups/:id/messages', requireAuth, async (req, res) => {
  const gid    = parseId(req.params.id);
  const limit  = Math.min(50, parseInt(req.query.limit) || 30);
  const before = req.query.before || null;
  if (!gid) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member) return res.status(403).json({ error: 'NON_MEMBRE' });
    const r = await _migPool.query(\`
      SELECT gm.*, u.name AS sender_name, u.avatar_photo AS sender_photo, u.avatar_color AS sender_color,
        (SELECT json_agg(json_build_object('emoji', emoji, 'user_id', user_id))
         FROM group_message_reactions WHERE message_id = gm.id) AS reactions,
        (SELECT COUNT(*) FROM group_message_reads WHERE message_id = gm.id) AS read_count,
        reply.content AS reply_content, reply_u.name AS reply_sender_name
      FROM group_messages gm
      JOIN users u ON u.id = gm.sender_id
      LEFT JOIN group_messages reply ON reply.id = gm.reply_to_id
      LEFT JOIN users reply_u ON reply_u.id = reply.sender_id
      WHERE gm.group_id = $1
        \${before ? 'AND gm.created_at < $3' : ''}
      ORDER BY gm.created_at DESC
      LIMIT $2
    \`, before ? [gid, limit, before] : [gid, limit]);
    // Marquer comme lus
    for (const msg of r.rows) {
      if (msg.sender_id !== req.user.id) {
        await _migPool.query(
          'INSERT INTO group_message_reads (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [msg.id, req.user.id]
        );
      }
    }
    res.json(r.rows.reverse());
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST /api/groups/:id/messages — envoyer un message
app.post('/api/groups/:id/messages', requireAuth, async (req, res) => {
  const gid = parseId(req.params.id);
  if (!gid) return res.status(400).json({ error: 'ID_INVALIDE' });
  const { content, image, replyToId } = req.body;
  if (!content?.trim() && !image) return res.status(400).json({ error: 'CONTENU_VIDE' });
  if (content && content.trim().length > 2000) return res.status(400).json({ error: 'MESSAGE_TROP_LONG' });
  if (image && image.length > 2 * 1024 * 1024 * 1.37) return res.status(400).json({ error: 'IMAGE_TROP_GRANDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member) return res.status(403).json({ error: 'NON_MEMBRE' });
    const sender = await db.getUserById(req.user.id);
    const r = await _migPool.query(
      'INSERT INTO group_messages (group_id, sender_id, content, image, reply_to_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [gid, req.user.id, (content || '').trim(), image || '', replyToId || null]
    );
    const msg = {
      ...r.rows[0],
      sender_name:  sender.name,
      sender_photo: sender.avatarPhoto || '',
      sender_color: sender.avatarColor || '#6c63ff',
      reactions:    [],
      read_count:   0
    };
    // Marquer comme lu par l'expéditeur
    await _migPool.query(
      'INSERT INTO group_message_reads (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [msg.id, req.user.id]
    );
    // SSE → tous les membres
    const members = await _migPool.query(
      'SELECT user_id FROM group_members WHERE group_id=$1', [gid]
    );
    _notifyGroupMembers(gid, members.rows, { type: 'GROUP_MESSAGE', groupId: gid, message: msg });
    // Push + notification aux membres absents
    const group = await _migPool.query('SELECT name FROM groups WHERE id=$1', [gid]);
    const groupName = group.rows[0]?.name || 'Groupe';
    for (const m of members.rows) {
      if (m.user_id === req.user.id) continue;
      await db.createNotification({
        userId: m.user_id, type: 'GROUP_MESSAGE',
        message: \`\${sender.name} dans "\${groupName}" : \${(content || '').slice(0, 60)}\`,
        link: 'messages.html?tab=groups&group=' + gid
      });
      sendPush(m.user_id, sender.name + ' — ' + groupName, (content || 'Photo').slice(0, 80), 'messages.html?tab=groups&group=' + gid);
    }
    res.json(msg);
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// POST /api/groups/:id/messages/:msgId/reaction — réagir à un message
app.post('/api/groups/:id/messages/:msgId/reaction', requireAuth, async (req, res) => {
  const gid   = parseId(req.params.id);
  const msgId = parseId(req.params.msgId);
  const { emoji, action } = req.body;
  if (!gid || !msgId) return res.status(400).json({ error: 'ID_INVALIDE' });
  if (!emoji) return res.status(400).json({ error: 'EMOJI_REQUIS' });
  const ALLOWED = ['❤️','😂','😮','😢','😡','👍'];
  if (!ALLOWED.includes(emoji)) return res.status(400).json({ error: 'EMOJI_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member) return res.status(403).json({ error: 'NON_MEMBRE' });
    if (action === 'remove') {
      await _migPool.query(
        'DELETE FROM group_message_reactions WHERE message_id=$1 AND user_id=$2',
        [msgId, req.user.id]
      );
    } else {
      await _migPool.query(
        'INSERT INTO group_message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji=$3, created_at=NOW()',
        [msgId, req.user.id, emoji]
      );
    }
    // SSE → membres
    const members = await _migPool.query('SELECT user_id FROM group_members WHERE group_id=$1', [gid]);
    _notifyGroupMembers(gid, members.rows, {
      type: 'GROUP_REACTION', groupId: gid, msgId, emoji, userId: req.user.id, action: action || 'add'
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// DELETE /api/groups/:id/messages/:msgId — supprimer son message
app.delete('/api/groups/:id/messages/:msgId', requireAuth, async (req, res) => {
  const gid   = parseId(req.params.id);
  const msgId = parseId(req.params.msgId);
  if (!gid || !msgId) return res.status(400).json({ error: 'ID_INVALIDE' });
  try {
    const member = await _isGroupMember(gid, req.user.id);
    if (!member) return res.status(403).json({ error: 'NON_MEMBRE' });
    // Admin groupe peut supprimer n'importe quel message
    const cond = member.role === 'admin'
      ? 'id=$1 AND group_id=$2'
      : 'id=$1 AND group_id=$2 AND sender_id=$3';
    const vals = member.role === 'admin' ? [msgId, gid] : [msgId, gid, req.user.id];
    const r = await _migPool.query(\`DELETE FROM group_messages WHERE \${cond} RETURNING id\`, vals);
    if (!r.rowCount) return res.status(403).json({ error: 'INTERDIT' });
    // SSE → membres
    const members = await _migPool.query('SELECT user_id FROM group_members WHERE group_id=$1', [gid]);
    _notifyGroupMembers(gid, members.rows, { type: 'GROUP_MSG_DELETE', groupId: gid, msgId });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'ERREUR_SERVEUR' }); }
});

// ══ FIN GROUPES ═════════════════════════════════════════════════════════════

`;

src = src.replace(ANCHOR, ROUTES + ANCHOR);
fs.writeFileSync(indexPath, src, 'utf8');
console.log('✅ Routes groupes injectées dans index.js');
