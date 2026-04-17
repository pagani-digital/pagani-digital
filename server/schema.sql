-- ============================================================
--  PAGANI DIGITAL — Schéma PostgreSQL
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user',
  plan          TEXT        NOT NULL DEFAULT 'Starter',
  ref_code      TEXT        NOT NULL UNIQUE,
  referred_by   TEXT,
  avatar_color  TEXT        DEFAULT '#6c63ff',
  avatar_photo  TEXT        DEFAULT '',
  bio           TEXT        DEFAULT '',
  location      TEXT        DEFAULT '',
  website       TEXT        DEFAULT '',
  phone         TEXT        DEFAULT '',
  mm_phone      TEXT        DEFAULT '',
  mm_operator   TEXT        DEFAULT 'MVola',
  mm_name       TEXT        DEFAULT '',
  mm_accounts   JSONB       DEFAULT '[]',
  unlocked_courses JSONB    DEFAULT '[]',
  following_privacy TEXT    DEFAULT 'public',
  earnings_ar   NUMERIC     DEFAULT 0,
  pending_ar    NUMERIC     DEFAULT 0,
  paid_ar       NUMERIC     DEFAULT 0,
  refs          INTEGER     DEFAULT 0,
  is_active     BOOLEAN     DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── VIDEOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id           SERIAL PRIMARY KEY,
  title        TEXT        NOT NULL,
  description  TEXT        DEFAULT '',
  category     TEXT        DEFAULT 'debutant',
  level        TEXT        DEFAULT 'Débutant',
  duration     TEXT        DEFAULT '',
  icon         TEXT        DEFAULT 'fas fa-play-circle',
  free         BOOLEAN     DEFAULT false,
  access_type  TEXT        DEFAULT 'pro',
  price        NUMERIC     DEFAULT 0,
  unit_price   NUMERIC,
  video_source TEXT        DEFAULT 'youtube',
  video_id     TEXT        DEFAULT '',
  drive_id     TEXT        DEFAULT '',
  thumbnail    TEXT        DEFAULT '',
  video_description TEXT   DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── POSTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id           SERIAL PRIMARY KEY,
  title        TEXT        NOT NULL,
  content      TEXT        DEFAULT '',
  category     TEXT        DEFAULT 'Annonce',
  image        TEXT        DEFAULT '',
  link         TEXT        DEFAULT '',
  link_label   TEXT        DEFAULT 'En savoir plus',
  author       TEXT        DEFAULT 'Admin',
  author_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  author_color TEXT        DEFAULT '#6c63ff',
  author_photo TEXT        DEFAULT '',
  likes        JSONB       DEFAULT '[]',
  comments     JSONB       DEFAULT '[]',
  date         TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- Ajouter created_at si la table existe déjà sans cette colonne
ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- Remplir created_at depuis date pour les anciens posts
UPDATE posts SET created_at = date WHERE created_at IS NULL;

-- ── COMMISSIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commissions (
  id           SERIAL PRIMARY KEY,
  affiliate_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filleul_id   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  filleul_name TEXT        DEFAULT '',
  type         TEXT        DEFAULT '',
  montant      NUMERIC     DEFAULT 0,
  statut       TEXT        DEFAULT 'En attente',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  paid_at      TIMESTAMPTZ
);

-- ── WITHDRAWS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdraws (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  montant    NUMERIC     NOT NULL,
  phone      TEXT        DEFAULT '',
  operator   TEXT        DEFAULT '',
  statut     TEXT        DEFAULT 'En attente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL,
  type       TEXT        DEFAULT '',
  message    TEXT        DEFAULT '',
  link       TEXT        DEFAULT '',
  read       BOOLEAN     DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYMENT ACCOUNTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_accounts (
  id               SERIAL PRIMARY KEY,
  operator         TEXT    NOT NULL UNIQUE,
  phone            TEXT    DEFAULT '',
  name             TEXT    DEFAULT '',
  color            TEXT    DEFAULT '',
  disabled         BOOLEAN DEFAULT false,
  disabled_reason  TEXT    DEFAULT '',
  disabled_at      TIMESTAMPTZ
);

-- ── UPGRADE REQUESTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upgrade_requests (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name     TEXT        DEFAULT '',
  plan          TEXT        NOT NULL,
  amount        NUMERIC     DEFAULT 0,
  phone         TEXT        DEFAULT '',
  operator      TEXT        DEFAULT '',
  mm_name       TEXT        DEFAULT '',
  tx_ref        TEXT        DEFAULT '',
  proof         TEXT        DEFAULT '',
  statut        TEXT        DEFAULT 'En attente',
  reject_reason TEXT        DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  treated_at    TIMESTAMPTZ
);

-- ── VIDEO MODULES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_modules (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  description TEXT        DEFAULT '',
  icon        TEXT        DEFAULT 'fas fa-layer-group',
  color       TEXT        DEFAULT '#6c63ff',
  position    INTEGER     DEFAULT 0,
  module_price NUMERIC,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Ajouter module_id dans videos si absent
ALTER TABLE videos ADD COLUMN IF NOT EXISTS module_id INTEGER REFERENCES video_modules(id) ON DELETE SET NULL;

-- ── MODULE PURCHASES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_purchases (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name     TEXT        DEFAULT '',
  module_id     INTEGER     REFERENCES video_modules(id) ON DELETE SET NULL,
  module_title  TEXT        DEFAULT '',
  amount        NUMERIC     DEFAULT 0,
  phone         TEXT        DEFAULT '',
  operator      TEXT        DEFAULT '',
  mm_name       TEXT        DEFAULT '',
  tx_ref        TEXT        DEFAULT '',
  proof         TEXT        DEFAULT '',
  statut        TEXT        DEFAULT 'En attente',
  reject_reason TEXT        DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  treated_at    TIMESTAMPTZ
);

-- ── VIDEO PURCHASES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_purchases (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name     TEXT        DEFAULT '',
  video_id      INTEGER     REFERENCES videos(id) ON DELETE SET NULL,
  video_title   TEXT        DEFAULT '',
  amount        NUMERIC     DEFAULT 0,
  phone         TEXT        DEFAULT '',
  operator      TEXT        DEFAULT '',
  mm_name       TEXT        DEFAULT '',
  tx_ref        TEXT        DEFAULT '',
  proof         TEXT        DEFAULT '',
  statut        TEXT        DEFAULT 'En attente',
  reject_reason TEXT        DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  treated_at    TIMESTAMPTZ
);

-- ── PRICING ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing (
  id              SERIAL PRIMARY KEY,
  pro             NUMERIC  DEFAULT 30000,
  elite           NUMERIC  DEFAULT 90000,
  video           NUMERIC  DEFAULT 10000,
  withdraw_min    NUMERIC  DEFAULT 5000,
  comm_starter    JSONB    DEFAULT '{"abonnement":20,"formation":15}',
  comm_pro        JSONB    DEFAULT '{"abonnement":35,"formation":25}',
  comm_elite      JSONB    DEFAULT '{"abonnement":50,"formation":40}',
  updated_at      TIMESTAMPTZ
);

-- Insérer la ligne de pricing par défaut si elle n'existe pas
INSERT INTO pricing (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── MESSAGES PRIVÉS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private_messages (
  id          SERIAL PRIMARY KEY,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── FOLLOWS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id          SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- ── SOCIAL LINKS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_links (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  facebook TEXT    DEFAULT '',
  tiktok   TEXT    DEFAULT '',
  telegram TEXT    DEFAULT '',
  youtube  TEXT    DEFAULT ''
);
INSERT INTO social_links (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── NAVBAR BUTTON ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS navbar_button (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  enabled  BOOLEAN DEFAULT false,
  label    TEXT    DEFAULT '',
  icon_url TEXT    DEFAULT '',
  link     TEXT    DEFAULT ''
);
INSERT INTO navbar_button (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── INDEX ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_ref_code   ON users(ref_code);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_user ON video_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_module_purchases_user ON module_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user ON upgrade_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender   ON private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_receiver ON private_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
