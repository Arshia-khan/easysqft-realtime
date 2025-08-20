// ===============================
// Realtime Microservice for EasySQFT
// ===============================

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// Environment Variables
// ===============================
const PORT = process.env.PORT || 3000;
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const EMAIL_USER = process.env.EMAIL_USER; // e.g. your Gmail or SMTP user
const EMAIL_PASS = process.env.EMAIL_PASS; // SMTP password or app password

// ===============================
// WebSocket Setup
// ===============================
const wss = new WebSocketServer({ noServer: true });
const sellers = new Set();

const server = app.listen(PORT, () => console.log(`Realtime service running on port ${PORT}`));
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', ws => {
    console.log('✅ Seller connected via WebSocket');
    sellers.add(ws);

    ws.on('close', () => {
        sellers.delete(ws);
    });
});

// ===============================
// MySQL Connection Pool
// ===============================
const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ===============================
// Email Setup (Nodemailer)
// ===============================
const transporter = nodemailer.createTransport({
    service: 'gmail', // or 'smtp'
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

async function sendEmail(to, subject, text) {
    try {
        await transporter.sendMail({
            from: `"EasySQFT" <${EMAIL_USER}>`,
            to,
            subject,
            text
        });
        console.log(`📩 Email sent to ${to}`);
    } catch (err) {
        console.error("❌ Email error:", err);
    }
}

// ===============================
// API: Buyer Search
// ===============================
app.post('/search', async (req, res) => {
    const { location, type } = req.body;

    try {
        // Query for real-time matches
        const [matches] = await pool.query(
            'SELECT * FROM seller_listings WHERE location=? AND type=?',
            [location, type]
        );

        // Notify sellers via WebSocket
        const message = JSON.stringify({ type: 'buyer-search', criteria: { location, type } });
        let onlineCount = 0;

        sellers.forEach(s => {
            if (s.readyState === 1) {
                s.send(message);
                onlineCount++;
            }
        });

        // Email fallback for offline sellers
        if (onlineCount === 0 && matches.length > 0) {
            for (const seller of matches) {
                if (seller.email) {
                    await sendEmail(
                        seller.email,
                        "New Buyer Interested!",
                        `A buyer is looking for a property in ${location} (${type}). Login to EasySQFT to connect.`
                    );
                }
            }
        }

        res.json({ matches });

    } catch (err) {
        console.error('❌ Search error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Endpoint for Houzez webhook: new property submissions
app.post('/notify-sellers', async (req, res) => {
    try {
        // Map incoming fields from Houzez form to microservice format
        const property = {
            title: req.body.title || req.body.property_title,
            location: req.body.location || req.body.property_location,
            type: req.body.property_type || req.body.type,
            price: req.body.price || 0
        };

        // Broadcast to all connected sellers via WebSocket
        const message = JSON.stringify({ type: 'buyer-search', criteria: property });
        sellers.forEach(s => {
            if (s.readyState === 1) s.send(message);
        });

        // Optionally: save to database for fallback emails
        // await pool.query('INSERT INTO seller_listings SET ?', property);

        res.json({ status: 'notified', property });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ status: 'error', error: err.message });
    }
});


// ===============================
// Health check
// ===============================
app.get('/', (req, res) => {
    res.send('Realtime microservice is live with email fallback!');
});
