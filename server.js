const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const DB_PATH = path.join(__dirname, 'ratings.db');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

// ===== DATABASE SETUP =====
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL DEFAULT 'legacy',
    filename   TEXT NOT NULL,
    action     TEXT NOT NULL CHECK(action IN ('like', 'dislike', 'fav')),
    rated_at   DATETIME DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ratings_filename ON ratings(filename);
  CREATE INDEX IF NOT EXISTS idx_ratings_action   ON ratings(action);
  CREATE INDEX IF NOT EXISTS idx_ratings_session  ON ratings(session_id);
`);

// Migration: add session_id column to existing DBs
try {
  db.exec(`ALTER TABLE ratings ADD COLUMN session_id TEXT NOT NULL DEFAULT 'legacy'`);
} catch (_) { /* column already exists — ignore */ }

// ===== PREPARED STATEMENTS =====
const insertRating = db.prepare(
  `INSERT INTO ratings (session_id, filename, action) VALUES (?, ?, ?)`
);

const getSessionStats = db.prepare(`
  SELECT
    SUM(CASE WHEN action = 'like'    THEN 1 ELSE 0 END) AS likes,
    SUM(CASE WHEN action = 'dislike' THEN 1 ELSE 0 END) AS dislikes,
    SUM(CASE WHEN action = 'fav'     THEN 1 ELSE 0 END) AS favs,
    COUNT(*) AS total
  FROM ratings WHERE session_id = ?
`);

const getSeenBySession = db.prepare(
  `SELECT DISTINCT filename FROM ratings WHERE session_id = ?`
);

const getFavsBySession = db.prepare(`
  SELECT filename, rated_at FROM ratings
  WHERE session_id = ? AND action = 'fav'
  ORDER BY rated_at DESC
`);

const getGlobalStats = db.prepare(`
  SELECT
    SUM(CASE WHEN action = 'like'    THEN 1 ELSE 0 END) AS likes,
    SUM(CASE WHEN action = 'dislike' THEN 1 ELSE 0 END) AS dislikes,
    SUM(CASE WHEN action = 'fav'     THEN 1 ELSE 0 END) AS favs,
    COUNT(*) AS total
  FROM ratings
`);

const getTopImages = db.prepare(`
  SELECT
    filename,
    SUM(CASE WHEN action = 'like' THEN 1 ELSE 0 END) +
    SUM(CASE WHEN action = 'fav'  THEN 2 ELSE 0 END) AS score,
    SUM(CASE WHEN action = 'like'    THEN 1 ELSE 0 END) AS likes,
    SUM(CASE WHEN action = 'dislike' THEN 1 ELSE 0 END) AS dislikes,
    SUM(CASE WHEN action = 'fav'     THEN 1 ELSE 0 END) AS favs
  FROM ratings GROUP BY filename ORDER BY score DESC LIMIT ?
`);

const getRecentRatings = db.prepare(`
  SELECT filename, action, rated_at FROM ratings
  ORDER BY rated_at DESC LIMIT ?
`);

// ===== HELPER =====
function toImageObject(filename) {
  return {
    filename,
    url: `/images/${encodeURIComponent(filename)}`,
    title: path.basename(filename, path.extname(filename)).replace(/[-_]/g, ' '),
  };
}

// ===== MIDDLEWARE =====
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== API: Images (unseen by this session) =====
// GET /api/images?session=<uuid>
app.get('/api/images', (req, res) => {
  try {
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    let files = fs.readdirSync(IMAGES_DIR).filter(f =>
      SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );

    // Filter out already-seen images for this session
    const sessionId = req.query.session;
    if (sessionId) {
      const seen = new Set(getSeenBySession.all(sessionId).map(r => r.filename));
      files = files.filter(f => !seen.has(f));
    }

    // Fisher-Yates shuffle
    for (let i = files.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [files[i], files[j]] = [files[j], files[i]];
    }

    res.json({ images: files.map(toImageObject), total: files.length });
  } catch (err) {
    console.error('Error reading images directory:', err);
    res.status(500).json({ error: 'Could not read images directory' });
  }
});

// ===== API: Save a rating =====
// POST /api/rate  { session_id, filename, action }
app.post('/api/rate', (req, res) => {
  const { session_id, filename, action } = req.body;
  if (!session_id || !filename || !['like', 'dislike', 'fav'].includes(action)) {
    return res.status(400).json({ error: 'Invalid session_id, filename or action' });
  }
  try {
    const result = insertRating.run(session_id, filename, action);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error saving rating:', err);
    res.status(500).json({ error: 'Could not save rating' });
  }
});

// ===== API: Restore session =====
// GET /api/session/:id
app.get('/api/session/:id', (req, res) => {
  const sessionId = req.params.id;
  try {
    const stats     = getSessionStats.get(sessionId);
    const favorites = getFavsBySession.all(sessionId).map(r => toImageObject(r.filename));
    res.json({
      session_id: sessionId,
      stats: {
        likes:    stats.likes    || 0,
        dislikes: stats.dislikes || 0,
        favs:     stats.favs     || 0,
        total:    stats.total    || 0,
      },
      favorites,
      isReturning: (stats.total || 0) > 0,
    });
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ error: 'Could not fetch session data' });
  }
});

// ===== API: Global stats =====
app.get('/api/stats', (req, res) => {
  try { res.json(getGlobalStats.get()); }
  catch (err) { res.status(500).json({ error: 'Could not fetch stats' }); }
});

// ===== API: Top-rated images =====
app.get('/api/stats/top', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const images = getTopImages.all(limit).map(row => ({ ...row, ...toImageObject(row.filename) }));
    res.json({ images });
  } catch (err) { res.status(500).json({ error: 'Could not fetch top images' }); }
});

// ===== API: Recent ratings =====
app.get('/api/stats/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json({ ratings: getRecentRatings.all(limit) });
  } catch (err) { res.status(500).json({ error: 'Could not fetch recent ratings' }); }
});

// ===== API: Health =====
app.get('/api/health', (req, res) => {
  const stats = getGlobalStats.get();
  res.json({ status: 'ok', imagesDir: IMAGES_DIR, dbPath: DB_PATH, totalRatings: stats.total });
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => { db.close(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`\n🚀 Swipe Rating App running at http://localhost:${PORT}`);
  console.log(`📁 Images directory: ${IMAGES_DIR}`);
  console.log(`🗄️  Database: ${DB_PATH}\n`);
});
