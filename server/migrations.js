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


  // monthly_refs : compteur mensuel de parrainages
  await run('monthly_refs', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS monthly_refs (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month      TEXT NOT NULL,
      refs_count INTEGER DEFAULT 0,
      UNIQUE(user_id, month)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_monthly_refs_month ON monthly_refs(month)`);
  });

  // leaderboard_rewards : config prix + historique gagnants
  await run('leaderboard_rewards', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS leaderboard_rewards (
      id           SERIAL PRIMARY KEY,
      month        TEXT NOT NULL UNIQUE,
      prize_1      INTEGER DEFAULT 0,
      prize_2      INTEGER DEFAULT 0,
      prize_3      INTEGER DEFAULT 0,
      min_refs     INTEGER DEFAULT 5,
      winner_1_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner_2_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner_3_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      paid_1       BOOLEAN DEFAULT false,
      paid_2       BOOLEAN DEFAULT false,
      paid_3       BOOLEAN DEFAULT false,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )`);
  });

  // leaderboard_config : paramètres globaux (prix par défaut, min_refs)
  await run('leaderboard_config', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS leaderboard_config (
      id       INTEGER PRIMARY KEY DEFAULT 1,
      prize_1  INTEGER DEFAULT 10000,
      prize_2  INTEGER DEFAULT 5000,
      prize_3  INTEGER DEFAULT 2000,
      min_refs INTEGER DEFAULT 5
    )`);
    await pool.query(`INSERT INTO leaderboard_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  });
  // streak d'activité
  await run('users.streak', async () => {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_date DATE DEFAULT NULL`);
  });

  // Feed algo : colonne boost_score sur posts
  try {
    await pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS boost_score NUMERIC DEFAULT 0');
    console.log('[migrations] boost_score OK');
  } catch(e) { console.error('[migrations] boost_score:', e.message); }

  // ML : table user_interactions pour score d'affinité
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_interactions (
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reactions_count INTEGER DEFAULT 0,
        comments_count  INTEGER DEFAULT 0,
        likes_count     INTEGER DEFAULT 0,
        last_updated    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, target_user_id)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ui_user ON user_interactions(user_id)');
    console.log('[migrations] user_interactions OK');
  } catch(e) { console.error('[migrations] user_interactions:', e.message); }

  // ML : table user_category_prefs pour pertinence par catégorie
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_category_prefs (
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category       TEXT NOT NULL,
        interactions   INTEGER DEFAULT 0,
        last_updated   TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, category)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ucp_user ON user_category_prefs(user_id)');
    console.log('[migrations] user_category_prefs OK');
  } catch(e) { console.error('[migrations] user_category_prefs:', e.message); }

  // Formateurs partenaires
  await run('trainer_requests', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS trainer_requests (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name        TEXT    DEFAULT '',
      expertise        TEXT    DEFAULT '',
      description      TEXT    DEFAULT '',
      demo_url         TEXT    DEFAULT '',
      commission_rate  NUMERIC DEFAULT 50,
      statut           TEXT    DEFAULT 'En attente',
      reject_reason    TEXT    DEFAULT '',
      admin_note       TEXT    DEFAULT '',
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      treated_at       TIMESTAMPTZ
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trainer_requests_user ON trainer_requests(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trainer_requests_statut ON trainer_requests(statut)`);
  });

  await run('trainer_submissions', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS trainer_submissions (
      id               SERIAL PRIMARY KEY,
      trainer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trainer_name     TEXT    DEFAULT '',
      content_type     TEXT    NOT NULL DEFAULT 'video',
      title            TEXT    NOT NULL,
      description      TEXT    DEFAULT '',
      category         TEXT    DEFAULT 'debutant',
      level            TEXT    DEFAULT 'Débutant',
      duration         TEXT    DEFAULT '',
      price            NUMERIC DEFAULT 0,
      access_type      TEXT    DEFAULT 'unit',
      video_source     TEXT    DEFAULT 'youtube',
      video_id         TEXT    DEFAULT '',
      drive_id         TEXT    DEFAULT '',
      thumbnail        TEXT    DEFAULT '',
      cover            TEXT    DEFAULT '',
      file_url         TEXT    DEFAULT '',
      pages            INTEGER DEFAULT NULL,
      author_name      TEXT    DEFAULT '',
      statut           TEXT    DEFAULT 'En attente',
      reject_reason    TEXT    DEFAULT '',
      published_id     INTEGER DEFAULT NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      treated_at       TIMESTAMPTZ
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trainer_submissions_trainer ON trainer_submissions(trainer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trainer_submissions_statut ON trainer_submissions(statut)`);
  });

  await run('trainer_earnings', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS trainer_earnings (
      id                SERIAL PRIMARY KEY,
      trainer_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      buyer_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      buyer_name        TEXT    DEFAULT '',
      content_type      TEXT    DEFAULT 'video',
      content_id        INTEGER DEFAULT NULL,
      content_title     TEXT    DEFAULT '',
      sale_amount       NUMERIC DEFAULT 0,
      commission_rate   NUMERIC DEFAULT 50,
      commission_amount NUMERIC DEFAULT 0,
      statut            TEXT    DEFAULT 'En attente',
      paid_at           TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trainer_earnings_trainer ON trainer_earnings(trainer_id)`);
  });

  await run('users.trainer_fields', async () => {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_commission_rate NUMERIC DEFAULT 50`);
  });

  await run('videos.trainer_fields', async () => {
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS trainer_commission NUMERIC DEFAULT 0`);
  });

  await run('ebooks.trainer_fields', async () => {
    await pool.query(`ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS trainer_commission NUMERIC DEFAULT 0`);
  });

// Système modules formateur partenaire
  await run('video_modules.type', async () => {
    await pool.query(`ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'public'`);
    await pool.query(`ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    // Tous les modules existants sont publics par défaut
    await pool.query(`UPDATE video_modules SET type='public' WHERE type IS NULL`);
  });

  await run('module_purchases.trainer_commission', async () => {
    await pool.query(`ALTER TABLE module_purchases ADD COLUMN IF NOT EXISTS trainer_commission_paid BOOLEAN DEFAULT false`);
  });

  
  await run('private_messages.is_story_reply', async () => {
    await pool.query(`ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS is_story_reply SMALLINT DEFAULT 0`);
  });

  await run('private_messages.story_image', async () => {
    await pool.query(`ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS story_image TEXT DEFAULT ''`);
  });

  
  await run('private_messages.story_image', async () => {
    await pool.query(`ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS story_image TEXT DEFAULT ''`);
  });

  await run('trainer_submissions.module_id', async () => {
    await pool.query(`ALTER TABLE trainer_submissions ADD COLUMN IF NOT EXISTS module_id INTEGER REFERENCES video_modules(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE trainer_submissions ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0`);
  });

  // Groupes de discussion
  await run('groups', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS groups (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      photo      TEXT DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  });

  await run('group_members', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS group_members (
      group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'member',
      joined_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (group_id, user_id)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`);
  });

  await run('group_messages', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS group_messages (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      sender_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT DEFAULT '',
      image       TEXT DEFAULT '',
      type        TEXT DEFAULT 'message',
      reply_to_id INTEGER REFERENCES group_messages(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id)`);
  });

  await run('group_messages_type_col', async () => {
    await pool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'message'`);
    await pool.query(`ALTER TABLE group_messages ALTER COLUMN sender_id DROP NOT NULL`);
  });

  await run('group_messages_sender_nullable', async () => {
    await pool.query(`ALTER TABLE group_messages ALTER COLUMN sender_id DROP NOT NULL`);
  });

  await run('group_message_reads', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS group_message_reads (
      message_id INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    )`);
  });

  await run('group_message_reactions', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS group_message_reactions (
      id         SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_msg_reactions ON group_message_reactions(message_id)`);
  });

  // opportunites : jobs en ligne & affiliation externe
  await run('opportunites', async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS opportunites (
      id               SERIAL PRIMARY KEY,
      titre            TEXT NOT NULL,
      description      TEXT DEFAULT '',
      categorie        TEXT DEFAULT 'Autre',
      icone            TEXT DEFAULT 'fas fa-briefcase',
      couleur          TEXT DEFAULT '#6c63ff',
      badge            TEXT DEFAULT '',
      lien_affiliation TEXT DEFAULT '',
      actif            BOOLEAN DEFAULT true,
      ordre            INTEGER DEFAULT 0,
      clics            INTEGER DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_opportunites_actif ON opportunites(actif)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_opportunites_ordre ON opportunites(ordre)`);
  });
  // opportunites : ajout colonne image
  await run('opportunites.image', async () => {
    await pool.query(`ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS image TEXT DEFAULT ''`);
  });
}

module.exports = { runMigrations };
