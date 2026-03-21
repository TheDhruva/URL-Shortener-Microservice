const connectToDatabase = require('../utils/db');
const Url = require('../models/Url');
const dns = require('dns');
const { URL } = require('url');

function validateUrl(rawUrl, callback) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return callback(false);
    dns.lookup(parsed.hostname, (err) => {
      callback(!err);
    });
  } catch {
    callback(false);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  await connectToDatabase();
  const { url } = req.body;

  validateUrl(url, async (isValid) => {
    if (!isValid) return res.json({ error: 'invalid url' });

    try {
      let existing = await Url.findOne({ original_url: url });
      if (existing) return res.json({ original_url: existing.original_url, short_url: existing.short_url });

      const count = await Url.countDocuments();
      const newUrl = new Url({ original_url: url, short_url: count + 1 });
      await newUrl.save();

      res.json({ original_url: newUrl.original_url, short_url: newUrl.short_url });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });
};
