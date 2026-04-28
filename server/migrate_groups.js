// Migration : système de groupes de discussion
// Exécuter depuis server/ : node migrate_groups.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      user:     process.env.DB_USER     || 'postgres',
      host:     process.env.DB_HOST     || 'localhost',
      database: process.env.DB_NAME     || 'pagani',
      password: process.env.DB_PASSWORD || process.env.DB_PASS || 'password',
      port:     parseInt(process.env.DB_PORT) || 5432,
    });

async function run(name, fn) {
  try   { await fn(); console.log(`[OK] ${name}`); }
  catch(e) { console.error(`[ERREUR] ${name} :`, e.message); }
}

async function migrate() {
  // 1. groups
  await run('groups', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id         SERIAL PRIMARY KEY,
        name       TEXT        NOT NULL,
        photo      TEXT        DEFAULT '',
        created_by INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by)`);
  });

  // 2. group_members
  await run('group_members', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id  INTEGER     NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role      TEXT        NOT NULL DEFAULT 'member',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_members_user  ON group_members(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`);
  });

  // 3. group_messages
  await run('group_messages', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id          SERIAL PRIMARY KEY,
        group_id    INTEGER     NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        sender_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content     TEXT        DEFAULT '',
        image       TEXT        DEFAULT '',
        reply_to_id INTEGER     REFERENCES group_messages(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_messages_group  ON group_messages(group_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_messages_sender ON group_messages(sender_id)`);
  });

  // 4. group_message_reactions
  await run('group_message_reactions', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_message_reactions (
        message_id INTEGER     NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
        user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji      TEXT        NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_reactions_msg ON group_message_reactions(message_id)`);
  });

  // 5. group_message_reads (vu par X membres)
  await run('group_message_reads', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_message_reads (
        message_id INTEGER     NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
        user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_reads_msg  ON group_message_reads(message_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_reads_user ON group_message_reads(user_id)`);
  });

  console.log('\n✅ Migration groupes terminée.');
  await pool.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
