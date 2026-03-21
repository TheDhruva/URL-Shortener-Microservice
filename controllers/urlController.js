const dns = require('dns');
const { URL } = require('url');
const Url = require('../models/Url');

function validateUrl(rawUrl, callback) {
  try {
    const parsed = new URL(rawUrl);
    // Only allow http/https — fCC sends ftp:// as invalid
    if (!['http:', 'https:'].includes(parsed.protocol)) return callback(false);
    dns.lookup(parsed.hostname, (err) => {
      callback(!err);
    });
  } catch {
    callback(false);
  }
}

exports.shortenUrl = (req, res) => {
  const { url } = req.body;

  validateUrl(url, async (isValid) => {
    if (!isValid) return res.json({ error: 'invalid url' });

    try {
      // Check if already exists
      let existing = await Url.findOne({ original_url: url });
      if (existing) return res.json({ original_url: existing.original_url, short_url: existing.short_url });

      // Auto-increment short_url
      const count = await Url.countDocuments();
      const newUrl = new Url({ original_url: url, short_url: count + 1 });
      await newUrl.save();

      res.json({ original_url: newUrl.original_url, short_url: newUrl.short_url });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });
};

exports.redirectUrl = async (req, res) => {
  const short = parseInt(req.params.short_url);

  try {
    const found = await Url.findOne({ short_url: short });
    if (!found) return res.json({ error: 'no short url found' });
    res.redirect(found.original_url);
  } catch {
    res.status(500).json({ error: 'server error' });
  }
};
