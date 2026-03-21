const connectToDatabase = require('../../utils/db');
const Url = require('../../models/Url');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  await connectToDatabase();
  const short = parseInt(req.query.short_url);

  try {
    const found = await Url.findOne({ short_url: short });
    if (!found) return res.json({ error: 'no short url found' });
    res.redirect(found.original_url);
  } catch {
    res.status(500).json({ error: 'server error' });
  }
};
