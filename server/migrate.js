require('dotenv').config();
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'pagani.db.json');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'Pagani10',
  database: process.env.DB_NAME     || 'pagani',
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('✅ Connexion PostgreSQL établie');

    // ── Lire la DB JSON ──────────────────────────────────────
    if (!fs.existsSync(DB_PATH)) {
      console.error('❌ pagani.db.json introuvable');
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    console.log(`📦 Données JSON chargées`);

    // ── Créer le schéma ──────────────────────────────────────
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ Schéma créé');

    await client.query('BEGIN');

    // ── 1. USERS ─────────────────────────────────────────────
    console.log(`\n👤 Migration des utilisateurs (${data.users.length})...`);
    // Réinitialiser la séquence
    await client.query('TRUNCATE users CASCADE');

    for (const u of data.users) {
      await client.query(`
        INSERT INTO users (
          id, name, email, password_hash, role, plan, ref_code, referred_by,
          avatar_color, avatar_photo, bio, location, website, phone,
          mm_phone, mm_operator, mm_name, mm_accounts, unlocked_courses,
          earnings_ar, pending_ar, paid_ar, refs, is_active, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, email=EXCLUDED.email, password_hash=EXCLUDED.password_hash,
          role=EXCLUDED.role, plan=EXCLUDED.plan, ref_code=EXCLUDED.ref_code,
          referred_by=EXCLUDED.referred_by, avatar_color=EXCLUDED.avatar_color,
          avatar_photo=EXCLUDED.avatar_photo, bio=EXCLUDED.bio, location=EXCLUDED.location,
          website=EXCLUDED.website, phone=EXCLUDED.phone, mm_phone=EXCLUDED.mm_phone,
          mm_operator=EXCLUDED.mm_operator, mm_name=EXCLUDED.mm_name,
          mm_accounts=EXCLUDED.mm_accounts, unlocked_courses=EXCLUDED.unlocked_courses,
          earnings_ar=EXCLUDED.earnings_ar, pending_ar=EXCLUDED.pending_ar,
          paid_ar=EXCLUDED.paid_ar, refs=EXCLUDED.refs, is_active=EXCLUDED.is_active,
          created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at
      `, [
        u.id, u.name, u.email, u.passwordHash,
        u.role || 'user', u.plan || 'Starter', u.refCode, u.referredBy || null,
        u.avatarColor || '#6c63ff',
        // Tronquer les avatars base64 trop longs (> 500KB) pour éviter les problèmes
        (u.avatarPhoto && u.avatarPhoto.length > 500000) ? '' : (u.avatarPhoto || ''),
        u.bio || '', u.location || '', u.website || '', u.phone || '',
        u.mmPhone || '', u.mmOperator || 'MVola', u.mmName || u.name,
        JSON.stringify(u.mmAccounts || []),
        JSON.stringify(u.unlockedCourses || []),
        u.earningsAR || 0, u.pendingAR || 0, u.paidAR || 0,
        u.refs || 0, u.isActive !== false,
        u.createdAt || new Date().toISOString(),
        u.updatedAt || new Date().toISOString()
      ]);
    }
    // Resynchroniser la séquence
    const maxUserId = Math.max(...data.users.map(u => u.id), 0);
    await client.query(`SELECT setval('users_id_seq', $1)`, [maxUserId]);
    console.log(`   ✅ ${data.users.length} utilisateurs migrés`);

    // ── 2. VIDEOS ────────────────────────────────────────────
    console.log(`\n🎬 Migration des vidéos (${data.videos.length})...`);
    await client.query('TRUNCATE videos CASCADE');

    for (const v of data.videos) {
      await client.query(`
        INSERT INTO videos (
          id, title, description, category, level, duration, icon,
          free, access_type, price, unit_price, video_source, video_id,
          drive_id, thumbnail, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title, description=EXCLUDED.description,
          category=EXCLUDED.category, level=EXCLUDED.level, duration=EXCLUDED.duration,
          icon=EXCLUDED.icon, free=EXCLUDED.free, access_type=EXCLUDED.access_type,
          price=EXCLUDED.price, unit_price=EXCLUDED.unit_price,
          video_source=EXCLUDED.video_source, video_id=EXCLUDED.video_id,
          drive_id=EXCLUDED.drive_id, thumbnail=EXCLUDED.thumbnail,
          created_at=EXCLUDED.created_at
      `, [
        v.id, v.title, v.desc || '',
        v.category || 'debutant', v.level || 'Débutant',
        v.duration || '', v.icon || 'fas fa-play-circle',
        !!v.free, v.accessType || (v.free ? 'free' : 'pro'),
        v.price || 0, v.unitPrice || null,
        v.videoSource || 'youtube', v.videoId || '',
        v.driveId || '',
        // Tronquer les thumbnails base64 trop longs
        (v.thumbnail && v.thumbnail.startsWith('data:') && v.thumbnail.length > 500000) ? '' : (v.thumbnail || ''),
        v.createdAt || new Date().toISOString()
      ]);
    }
    const maxVideoId = Math.max(...data.videos.map(v => v.id), 0);
    await client.query(`SELECT setval('videos_id_seq', $1)`, [maxVideoId]);
    console.log(`   ✅ ${data.videos.length} vidéos migrées`);

    // ── 3. POSTS ─────────────────────────────────────────────
    const posts = data.posts || [];
    console.log(`\n📰 Migration des posts (${posts.length})...`);
    await client.query('TRUNCATE posts CASCADE');

    for (const p of posts) {
      // Tronquer les images base64 dans les posts
      const image = (p.image && p.image.startsWith('data:') && p.image.length > 500000) ? '' : (p.image || '');
      // Tronquer les avatarPhoto dans les commentaires
      const comments = (p.comments || []).map(c => ({
        ...c,
        authorPhoto: (c.authorPhoto && c.authorPhoto.length > 100000) ? '' : (c.authorPhoto || ''),
        replies: (c.replies || []).map(r => ({
          ...r,
          authorPhoto: (r.authorPhoto && r.authorPhoto.length > 100000) ? '' : (r.authorPhoto || '')
        }))
      }));

      await client.query(`
        INSERT INTO posts (
          id, title, content, category, image, link, link_label,
          author, author_id, author_color, author_photo, likes, comments, date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title, content=EXCLUDED.content, category=EXCLUDED.category,
          image=EXCLUDED.image, link=EXCLUDED.link, link_label=EXCLUDED.link_label,
          author=EXCLUDED.author, author_id=EXCLUDED.author_id,
          author_color=EXCLUDED.author_color, author_photo=EXCLUDED.author_photo,
          likes=EXCLUDED.likes, comments=EXCLUDED.comments, date=EXCLUDED.date
      `, [
        p.id, p.title, p.content || '', p.category || 'Annonce',
        image, p.link || '', p.linkLabel || 'En savoir plus',
        p.author || 'Admin',
        p.authorId ? parseInt(p.authorId) : null,
        p.authorColor || '#6c63ff',
        (p.authorPhoto && p.authorPhoto.length > 100000) ? '' : (p.authorPhoto || ''),
        JSON.stringify(p.likes || []),
        JSON.stringify(comments),
        p.date || new Date().toISOString()
      ]);
    }
    if (posts.length > 0) {
      const maxPostId = Math.max(...posts.map(p => p.id), 0);
      await client.query(`SELECT setval('posts_id_seq', $1)`, [maxPostId]);
    }
    console.log(`   ✅ ${posts.length} posts migrés`);

    // ── 4. COMMISSIONS ───────────────────────────────────────
    const commissions = data.commissions || [];
    console.log(`\n💰 Migration des commissions (${commissions.length})...`);
    await client.query('TRUNCATE commissions CASCADE');

    for (const c of commissions) {
      await client.query(`
        INSERT INTO commissions (
          id, affiliate_id, filleul_id, filleul_name, type, montant, statut, created_at, paid_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING
      `, [
        c.id, c.affiliateId,
        c.filleulId || null,
        c.filleulName || '', c.type || '',
        c.montant || 0, c.statut || 'En attente',
        c.createdAt || new Date().toISOString(),
        c.paidAt || null
      ]);
    }
    if (commissions.length > 0) {
      const maxCommId = Math.max(...commissions.map(c => c.id), 0);
      await client.query(`SELECT setval('commissions_id_seq', $1)`, [maxCommId]);
    }
    console.log(`   ✅ ${commissions.length} commissions migrées`);

    // ── 5. WITHDRAWS ─────────────────────────────────────────
    const withdraws = data.withdraws || [];
    console.log(`\n💸 Migration des retraits (${withdraws.length})...`);
    await client.query('TRUNCATE withdraws CASCADE');

    for (const w of withdraws) {
      await client.query(`
        INSERT INTO withdraws (id, user_id, montant, phone, operator, statut, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [
        w.id, w.userId, w.montant || 0,
        w.phone || '', w.operator || '',
        w.statut || 'En attente',
        w.createdAt || new Date().toISOString()
      ]);
    }
    if (withdraws.length > 0) {
      const maxWId = Math.max(...withdraws.map(w => w.id), 0);
      await client.query(`SELECT setval('withdraws_id_seq', $1)`, [maxWId]);
    }
    console.log(`   ✅ ${withdraws.length} retraits migrés`);

    // ── 6. NOTIFICATIONS ─────────────────────────────────────
    const notifications = data.notifications || [];
    console.log(`\n🔔 Migration des notifications (${notifications.length})...`);
    await client.query('TRUNCATE notifications CASCADE');

    for (const n of notifications) {
      await client.query(`
        INSERT INTO notifications (id, user_id, type, message, link, read, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [
        n.id, n.userId, n.type || '',
        n.message || '', n.link || '',
        !!n.read,
        n.createdAt || new Date().toISOString()
      ]);
    }
    if (notifications.length > 0) {
      const maxNId = Math.max(...notifications.map(n => n.id), 0);
      await client.query(`SELECT setval('notifications_id_seq', $1)`, [maxNId]);
    }
    console.log(`   ✅ ${notifications.length} notifications migrées`);

    // ── 7. PAYMENT ACCOUNTS ──────────────────────────────────
    const paymentAccounts = data.paymentAccounts || [];
    console.log(`\n💳 Migration des comptes de paiement (${paymentAccounts.length})...`);
    await client.query('TRUNCATE payment_accounts CASCADE');

    for (const a of paymentAccounts) {
      await client.query(`
        INSERT INTO payment_accounts (operator, phone, name, color, disabled, disabled_reason, disabled_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (operator) DO UPDATE SET
          phone=EXCLUDED.phone, name=EXCLUDED.name, color=EXCLUDED.color,
          disabled=EXCLUDED.disabled, disabled_reason=EXCLUDED.disabled_reason,
          disabled_at=EXCLUDED.disabled_at
      `, [
        a.operator, a.phone || '', a.name || '',
        a.color || '', !!a.disabled,
        a.disabledReason || '', a.disabledAt || null
      ]);
    }
    console.log(`   ✅ ${paymentAccounts.length} comptes de paiement migrés`);

    // ── 8. UPGRADE REQUESTS ──────────────────────────────────
    const upgradeRequests = data.upgradeRequests || [];
    console.log(`\n📋 Migration des demandes d'abonnement (${upgradeRequests.length})...`);
    await client.query('TRUNCATE upgrade_requests CASCADE');

    for (const r of upgradeRequests) {
      await client.query(`
        INSERT INTO upgrade_requests (
          id, user_id, user_name, plan, amount, phone, operator, mm_name,
          tx_ref, proof, statut, reject_reason, created_at, treated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING
      `, [
        r.id, r.userId, r.userName || '',
        r.plan, r.amount || 0, r.phone || '',
        r.operator || '', r.mmName || '',
        r.txRef || '',
        // Tronquer les preuves base64 trop longues
        (r.proof && r.proof.length > 1000000) ? '[PROOF_TRUNCATED]' : (r.proof || ''),
        r.statut || 'En attente', r.rejectReason || '',
        r.createdAt || new Date().toISOString(),
        r.treatedAt || null
      ]);
    }
    if (upgradeRequests.length > 0) {
      const maxRId = Math.max(...upgradeRequests.map(r => r.id), 0);
      await client.query(`SELECT setval('upgrade_requests_id_seq', $1)`, [maxRId]);
    }
    console.log(`   ✅ ${upgradeRequests.length} demandes d'abonnement migrées`);

    // ── 9. VIDEO PURCHASES ───────────────────────────────────
    const videoPurchases = data.videoPurchases || [];
    console.log(`\n🛒 Migration des achats vidéo (${videoPurchases.length})...`);
    await client.query('TRUNCATE video_purchases CASCADE');

    for (const p of videoPurchases) {
      await client.query(`
        INSERT INTO video_purchases (
          id, user_id, user_name, video_id, video_title, amount,
          phone, operator, mm_name, tx_ref, proof, statut, reject_reason,
          created_at, treated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO NOTHING
      `, [
        p.id, p.userId, p.userName || '',
        p.videoId || null, p.videoTitle || '',
        p.amount || 0, p.phone || '', p.operator || '',
        p.mmName || '', p.txRef || '',
        (p.proof && p.proof.length > 1000000) ? '[PROOF_TRUNCATED]' : (p.proof || ''),
        p.statut || 'En attente', p.rejectReason || '',
        p.createdAt || new Date().toISOString(),
        p.treatedAt || null
      ]);
    }
    if (videoPurchases.length > 0) {
      const maxVPId = Math.max(...videoPurchases.map(p => p.id), 0);
      await client.query(`SELECT setval('video_purchases_id_seq', $1)`, [maxVPId]);
    }
    console.log(`   ✅ ${videoPurchases.length} achats vidéo migrés`);

    // ── 10. PRICING ──────────────────────────────────────────
    const pricing = data.pricing || {};
    console.log(`\n💲 Migration des tarifs...`);
    await client.query(`
      INSERT INTO pricing (id, pro, elite, video, withdraw_min, comm_starter, comm_pro, comm_elite, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        pro=EXCLUDED.pro, elite=EXCLUDED.elite, video=EXCLUDED.video,
        withdraw_min=EXCLUDED.withdraw_min, comm_starter=EXCLUDED.comm_starter,
        comm_pro=EXCLUDED.comm_pro, comm_elite=EXCLUDED.comm_elite,
        updated_at=EXCLUDED.updated_at
    `, [
      pricing.pro || 30000, pricing.elite || 90000,
      pricing.video || 10000, pricing.withdrawMin || 5000,
      JSON.stringify(pricing.commStarter || { abonnement: 20, formation: 15 }),
      JSON.stringify(pricing.commPro     || { abonnement: 35, formation: 25 }),
      JSON.stringify(pricing.commElite   || { abonnement: 50, formation: 40 }),
      pricing.updatedAt || null
    ]);
    console.log(`   ✅ Tarifs migrés`);

    await client.query('COMMIT');

    // ── Résumé ───────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  ✅  Migration terminée avec succès !        ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  👤 Utilisateurs    : ${String(data.users.length).padEnd(22)}║`);
    console.log(`║  🎬 Vidéos          : ${String(data.videos.length).padEnd(22)}║`);
    console.log(`║  📰 Posts           : ${String(posts.length).padEnd(22)}║`);
    console.log(`║  💰 Commissions     : ${String(commissions.length).padEnd(22)}║`);
    console.log(`║  💸 Retraits        : ${String(withdraws.length).padEnd(22)}║`);
    console.log(`║  🔔 Notifications   : ${String(notifications.length).padEnd(22)}║`);
    console.log(`║  💳 Comptes paiement: ${String(paymentAccounts.length).padEnd(22)}║`);
    console.log(`║  📋 Demandes abo    : ${String(upgradeRequests.length).padEnd(22)}║`);
    console.log(`║  🛒 Achats vidéo    : ${String(videoPurchases.length).padEnd(22)}║`);
    console.log('╚══════════════════════════════════════════════╝');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Erreur migration :', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
