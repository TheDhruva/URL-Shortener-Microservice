require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dns = require('dns');
const mongoose = require('mongoose');
const app = express();

const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// --- DATABASE & STORAGE ---
const dbUrl = process.env.DB_URL || process.env.MONGO_URI;
const useMongo = Boolean(dbUrl);

if (useMongo) {
  mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err.message));
}

const shortUrlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true }
});
const ShortUrl = mongoose.model('ShortUrl', shortUrlSchema);

// In-memory store only when DB_URL is not set (e.g. local dev). On Vercel you MUST set DB_URL.
const memoryStore = new Map();
const memoryStoreByUrl = new Map();
let nextShort = 1;

async function ensureMongoConnected() {
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
    });
    return;
  }
  await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 });
}

async function findOrCreate(originalUrl) {
  if (useMongo) {
    await ensureMongoConnected();
    let doc = await ShortUrl.findOne({ original_url: originalUrl });
    if (doc) return { original_url: doc.original_url, short_url: doc.short_url };
    const count = await ShortUrl.countDocuments();
    const short = count + 1;
    doc = await ShortUrl.create({ original_url: originalUrl, short_url: short });
    return { original_url: doc.original_url, short_url: doc.short_url };
  }
  const existing = memoryStoreByUrl.get(originalUrl);
  if (existing != null) return { original_url: originalUrl, short_url: existing };
  const short = nextShort++;
  memoryStore.set(short, originalUrl);
  memoryStoreByUrl.set(originalUrl, short);
  return { original_url: originalUrl, short_url: short };
}

async function getOriginalUrl(shortUrlNum) {
  if (useMongo) {
    await ensureMongoConnected();
    const doc = await ShortUrl.findOne({ short_url: shortUrlNum });
    return doc ? doc.original_url : null;
  }
  return memoryStore.get(shortUrlNum) || null;
}

// --- ROUTES ---

// POST: Create short URL (FCC test 2)
app.post('/api/shorturl', (req, res) => {
  const raw = req.body && (req.body.url != null) ? req.body.url : '';
  const inputUrl = typeof raw === 'string' ? raw.trim() : '';

  if (!inputUrl) {
    return res.json({ error: 'invalid url' });
  }

  // Format: must be http:// or https:// (FCC test 4)
  if (!/^https?:\/\/.+/i.test(inputUrl)) {
    return res.json({ error: 'invalid url' });
  }

  let hostname;
  try {
    const u = new URL(inputUrl);
    hostname = u.hostname;
    if (!hostname) return res.json({ error: 'invalid url' });
  } catch (e) {
    return res.json({ error: 'invalid url' });
  }

  // Validate host exists (project hint: dns.lookup)
  const timeout = setTimeout(() => {
    if (!res.headersSent) res.json({ error: 'invalid url' });
  }, 8000);

  dns.lookup(hostname, async (err) => {
    clearTimeout(timeout);
    if (res.headersSent) return;
    if (err) return res.json({ error: 'invalid url' });

    try {
      const result = await findOrCreate(inputUrl);
      res.json({ original_url: result.original_url, short_url: result.short_url });
    } catch (e) {
      if (!res.headersSent) res.json({ error: 'invalid url' });
    }
  });
});

// GET: Redirect to original URL (FCC test 3)
app.get('/api/shorturl/:shorturl', async (req, res) => {
  const parsed = parseInt(req.params.shorturl, 10);
  if (Number.isNaN(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    return res.status(404).json({ error: 'invalid url' });
  }

  try {
    const originalUrl = await getOriginalUrl(parsed);
    if (originalUrl) return res.redirect(302, originalUrl);
    res.status(404).json({ error: 'invalid url' });
  } catch (e) {
    if (!res.headersSent) res.status(404).json({ error: 'invalid url' });
  }
});

app.get('/api/hello', (req, res) => {
  res.json({ greeting: 'hello API' });
});

// On Vercel, the app is used as the serverless handler (no listen). Locally, start the server.
if (!process.env.VERCEL) {
  app.listen(port, () => console.log('Listening on port', port));
}

module.exports = app;
