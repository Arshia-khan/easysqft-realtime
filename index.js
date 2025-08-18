const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const config = require('./config');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database
});

app.get('/', (req, res) => {
  res.send('Realtime microservice is live!');
});

app.post('/api/rt/buyer-intent', (req, res) => {
  const { buyer_id, city, location_lat, location_lon } = req.body;
  db.query(
    'INSERT INTO buyer_intents (buyer_id, city, location_lat, location_lon) VALUES (?, ?, ?, ?)',
    [buyer_id, city, location_lat, location_lon],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.send({ status: 'success', id: result.insertId });
    }
  );
});

app.post('/api/rt/seller-status', (req, res) => {
  const { seller_id, is_online } = req.body;
  db.query(
    'INSERT INTO seller_presence (seller_id, is_online) VALUES (?, ?) ON DUPLICATE KEY UPDATE is_online=?',
    [seller_id, is_online, is_online],
    (err) => {
      if (err) return res.status(500).send(err);
      res.send({ status: 'success' });
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Realtime service running on port ${PORT}`));
