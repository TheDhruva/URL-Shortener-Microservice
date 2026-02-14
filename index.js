require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dns = require('dns');
const mongoose = require('mongoose');
const app = express();

// Basic Configuration
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', function (req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

/*-----------------------------------------------------------------------------------------*/
/*---------------------------------------MY CODE-------------------------------------------*/
/*-----------------------------------------------------------------------------------------*/

// Use MongoDB only when DB_URL is set; otherwise use in-memory (so FCC tests pass with one store)
const dbUrl = process.env.DB_URL || process.env.MONGO_URI;
const useMongo = Boolean(dbUrl);

if (useMongo) {
  mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err.message));
}

const shortUrlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true }
});
const ShortUrl = mongoose.model('ShortUrl', shortUrlSchema);

// In-memory store: used only when DB_URL is not set (same store for POST and GET)
const memoryStore = new Map();       // short_url (number) -> original_url (string)
const memoryStoreByUrl = new Map(); // original_url -> short_url (number)
let nextShort = 1;

async function findOrCreateShortUrl(originalUrl) {
  if (useMongo) {
    let doc = await ShortUrl.findOne({ original_url: originalUrl });
    if (doc) return { original_url: doc.original_url, short_url: doc.short_url };
    const count = await ShortUrl.countDocuments();
    const max = Math.max(1000, count * 1000);
    for (let attempt = 0; attempt < 20; attempt++) {
      const short = Math.floor(Math.random() * max) + 1;
      const exists = await ShortUrl.findOne({ short_url: short });
      if (!exists) {
        doc = await ShortUrl.create({ original_url: originalUrl, short_url: short });
        return { original_url: doc.original_url, short_url: doc.short_url };
      }
    }
    const short = Math.floor(Math.random() * 100000) + 1;
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
    const doc = await ShortUrl.findOne({ short_url: shortUrlNum });
    return doc ? doc.original_url : null;
  }
  return memoryStore.get(shortUrlNum) || null;
}

// POST /api/shorturl - create short URL
app.post('/api/shorturl', (req, res) => {
  const input = (req.body.url || '').trim();
  if (input === '') {
    return res.json({ error: 'invalid url' });
  }
  if (!/^https?:\/\/.+/i.test(input)) {
    return res.json({ error: 'invalid url' });
  }

  let hostname;
  try {
    const urlObj = new URL(input);
    hostname = urlObj.hostname;
    if (!hostname) return res.json({ error: 'invalid url' });
  } catch (e) {
    return res.json({ error: 'invalid url' });
  }

  const lookupTimeout = setTimeout(() => {
    if (!res.headersSent) res.json({ error: 'invalid url' });
  }, 5000);

  dns.lookup(hostname, async (err) => {
    clearTimeout(lookupTimeout);
    if (res.headersSent) return;
    if (err) return res.json({ error: 'invalid url' });

    try {
      const result = await findOrCreateShortUrl(input);
      res.json({ original_url: result.original_url, short_url: result.short_url });
    } catch (e) {
      if (!res.headersSent) res.json({ error: 'invalid url' });
    }
  });
});

// GET /api/shorturl/:shorturl - redirect to original URL
app.get('/api/shorturl/:shorturl', async (req, res) => {
  const num = Number(req.params.shorturl);
  if (Number.isNaN(num) || num < 1 || !Number.isInteger(num)) {
    return res.status(404).json({ error: 'invalid url' });
  }
  try {
    const originalUrl = await getOriginalUrl(num);
    if (originalUrl) return res.redirect(302, originalUrl);
    res.status(404).json({ error: 'invalid url' });
  } catch (e) {
    if (!res.headersSent) res.status(404).json({ error: 'invalid url' });
  }
});

/*=========================================================================================*/

app.get('/api/hello', function (req, res) {
  res.json({ greeting: 'hello API' });
});

app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});