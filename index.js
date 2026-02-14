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

// MongoDB connection
const dbUrl = process.env.DB_URL || process.env.MONGO_URI;
if (!dbUrl) {
  console.warn('Warning: DB_URL (or MONGO_URI) not set. Create a .env file from sample.env and add your MongoDB connection string.');
}

mongoose.connect(dbUrl || 'mongodb://localhost:27017/url_shortener')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

// ShortUrl model
const shortUrlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true }
});
const ShortUrl = mongoose.model('ShortUrl', shortUrlSchema);

// Generate a unique short_url number
async function genShortUrl() {
  const count = await ShortUrl.countDocuments();
  const max = Math.max(1000, count * 1000);
  const min = 1;
  for (let attempt = 0; attempt < 20; attempt++) {
    const short = Math.floor(Math.random() * (max - min + 1)) + min;
    const exists = await ShortUrl.findOne({ short_url: short });
    if (!exists) return short;
  }
  return Date.now() % 100000 + 1;
}

// POST /api/shorturl - create short URL
app.post('/api/shorturl', (req, res) => {
  let input = (req.body.url || '').trim();
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
      let doc = await ShortUrl.findOne({ original_url: input });
      if (doc) {
        return res.json({ original_url: doc.original_url, short_url: doc.short_url });
      }
      const short = await genShortUrl();
      doc = await ShortUrl.create({ original_url: input, short_url: short });
      res.json({ original_url: doc.original_url, short_url: doc.short_url });
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: 'invalid url' });
    }
  });
});

// GET /api/shorturl/:shorturl - redirect to original URL
app.get('/api/shorturl/:shorturl', async (req, res) => {
  const num = Number(req.params.shorturl);
  if (!Number.isInteger(num) || num < 1) {
    return res.status(404).json({ error: 'invalid url' });
  }
  try {
    const doc = await ShortUrl.findOne({ short_url: num });
    if (doc) return res.redirect(doc.original_url);
    res.status(404).json({ error: 'invalid url' });
  } catch (e) {
    res.status(500).json({ error: 'invalid url' });
  }
});

/*=========================================================================================*/

app.get('/api/hello', function (req, res) {
  res.json({ greeting: 'hello API' });
});

app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});