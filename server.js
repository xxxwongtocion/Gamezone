const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

const SESSION_SECRET = process.env.SESSION_SECRET || 'darkx_secret_change_me';
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: true }));

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const dbPath = path.join(dataDir, 'games.db');

// Open (or create) the SQLite DB
const db = new sqlite3.Database(dbPath);

// Create table if not exists
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    size TEXT,
    url TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Admin password (server-side) - default 'DARKX2025' but you can set ADMIN_PASS env var
const ADMIN_PASS = process.env.ADMIN_PASS || 'DARKX2025';
const USER_PASSCODE = process.env.USER_PASSCODE || 'DARKX2025USER';

// Middleware to check admin session
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

app.get('/', (req, res) => {
  db.all('SELECT * FROM games ORDER BY created_at DESC', [], (err, rows) => {
    if (err) rows = [];
    res.render('index', { games: rows, passUnlocked: req.session.passUnlocked || false });
  });
});

// Route to submit a passcode to unlock special section
app.post('/unlock-pass', (req, res) => {
  const pass = (req.body.passcode || '').trim();
  if (pass === USER_PASSCODE) {
    req.session.passUnlocked = true;
    return res.redirect('/');
  }
  req.session.passUnlocked = false;
  return res.redirect('/');
});

// Admin login
app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});
app.post('/admin/login', (req, res) => {
  const p = (req.body.password || '').trim();
  if (p === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  return res.render('login', { error: 'Invalid password' });
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Admin panel
app.get('/admin', requireAdmin, (req, res) => {
  db.all('SELECT * FROM games ORDER BY created_at DESC', [], (err, rows) => {
    if (err) rows = [];
    res.render('admin', { games: rows, message: null });
  });
});

// Add game handler
app.post('/admin/add', requireAdmin, (req, res) => {
  const { name, size, url, description } = req.body;
  if (!name || !url) {
    return res.render('admin', { games: [], message: 'Name and Download Link are required.' });
  }
  const stmt = db.prepare('INSERT INTO games (name, size, url, description) VALUES (?, ?, ?, ?)');
  stmt.run(name.trim(), (size||'').trim(), url.trim(), (description||'').trim(), function(err) {
    if (err) return res.render('admin', { games: [], message: 'Error saving game.' });
    res.redirect('/admin');
  });
});

// Delete game (optional) - admin only
app.post('/admin/delete', requireAdmin, (req, res) => {
  const id = parseInt(req.body.id, 10);
  if (!id) return res.redirect('/admin');
  db.run('DELETE FROM games WHERE id = ?', [id], () => res.redirect('/admin'));
});

// Health check
app.get('/ping', (req, res) => res.send('OK'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DARKX Gamezone running on port ${PORT}`));
