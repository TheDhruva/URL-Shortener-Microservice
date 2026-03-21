const express = require('express');
const router = express.Router();
const { shortenUrl, redirectUrl } = require('../controllers/urlController');

router.post('/shorturl', shortenUrl);
router.get('/shorturl/:short_url', redirectUrl);

module.exports = router;
