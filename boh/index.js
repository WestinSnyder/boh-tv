const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const DATA_FILE = path.join(__dirname, 'boh-data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

router.use(express.static(PUBLIC_DIR));

router.get('/display', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'display.html'));
});

router.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

router.get('/api/data', (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: 'Could not read data file.' });
  }
});

router.post('/api/data', express.json(), (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not write data file.' });
  }
});

module.exports = router;
