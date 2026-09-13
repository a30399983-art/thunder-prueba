const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM gifts_catalog ORDER BY tier, cost').all();
  res.json(rows);
});

module.exports = router;
