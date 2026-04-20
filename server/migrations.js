// ============================================================
//  migrations.js — Migrations automatiques au démarrage
//  Toutes les migrations sont idempotentes (IF NOT EXISTS)
// ============================================================

async function runMigrations(pool) {
  const run = async (name, fn) => {
    try { await fn(); console.log('[Migration] ' + name + ' : OK'); }
    catch(e) { console.error('[Migration] ' + name + ' erreur :', e.message); }
  };

  // social_links
  await run('social_links', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS social_links (
      id INTEGER PRIMARY KEY DEFAULT 1,
      facebook TEXT DEFAULT '',
      tiktok   TEXT DEFAULT '',
      telegram TEXT DEFAULT '',
      youtube  TEXT DEFAULT ''
    )`);
    await pool.query(`INSERT INTO social_links (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  });

  // private_messages : colonne image
  await run('private_messages.image', async () => {
    await pool.query(`ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS image TEXT DEFAULT ''`);
  });

  // private_messages : colonne read_at
  await run('private_messages.read_at', async () => {
    await pool.query(`ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`);
  });

  // post_shares
  await run('post_shares', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS post_shares (
      id         SERIAL PRIMARY KEY,
      post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ref_code   TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_shares_post ON post_shares(post_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_shares_user ON post_shares(user_id)`);
  });

  // users : colonne last_seen (présence persistante)
  await run('users.last_seen', async () => {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen BIGINT DEFAULT NULL`);
  });

  // message_reactions
  await run('message_reactions', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS message_reactions (id SERIAL PRIMARY KEY, message_id INTEGER REFERENCES private_messages(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, emoji TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(message_id, user_id))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_msg_reactions_msg ON message_reactions(message_id)`);
  });

  // private_messages : reply_to_id
  await run('private_messages.reply_to_id', async () => {
    await pool.query(`ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES private_messages(id) ON DELETE SET NULL`);
  });

  // ebooks
  await run('ebooks', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS ebooks (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover       TEXT DEFAULT '',
      price       INTEGER NOT NULL DEFAULT 0,
      category    TEXT DEFAULT 'General',
      pages       INTEGER DEFAULT NULL,
      author      TEXT DEFAULT '',
      file_url    TEXT DEFAULT '',
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`);
  });

  // ebook_purchases
  await run('ebook_purchases', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS ebook_purchases (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
      user_name    TEXT DEFAULT '',
      ebook_id     INTEGER REFERENCES ebooks(id) ON DELETE CASCADE,
      ebook_title  TEXT DEFAULT '',
      amount       INTEGER NOT NULL DEFAULT 0,
      phone        TEXT DEFAULT '',
      operator     TEXT DEFAULT '',
      mm_name      TEXT DEFAULT '',
      tx_ref       TEXT DEFAULT '',
      proof        TEXT DEFAULT '',
      statut       TEXT DEFAULT 'En attente',
      reject_reason TEXT DEFAULT '',
      treated_at   TIMESTAMPTZ DEFAULT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ebook_purchases_user ON ebook_purchases(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ebook_purchases_ebook ON ebook_purchases(ebook_id)`);
  });

  // stories
  await run('stories', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS stories (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT DEFAULT '',
      image      TEXT DEFAULT '',
      bg_color   TEXT DEFAULT '#6c63ff',
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at)`);
  });

  // story_views
  await run('story_views', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS story_views (
      story_id   INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (story_id, user_id)
    )`);
  });

  // streak d'activité
  await run('users.streak', async () => {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_date DATE DEFAULT NULL`);
  });
}

module.exports = { runMigrations };
