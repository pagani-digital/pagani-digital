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
}

module.exports = { runMigrations };
