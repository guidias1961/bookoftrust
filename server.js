// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança básica de headers
app.disable('x-powered-by');

// Static
app.use(express.static(path.join(__dirname)));

// Body parser
app.use(express.json({ limit: '200kb' }));

// Rate limit simples por IP em memória
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const arr = hits.get(ip) || [];
  const recent = arr.filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > 10) return res.status(429).json({ ok: false, error: 'Too many requests' });
  next();
});

// Transport SMTP via env
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

app.post('/api/request-profile', async (req, res) => {
  try {
    const { handle = '', url = '', name = '', email = '', message = '' } = req.body || {};
    if (!handle || !url || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Missing fields' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || 'unknown';

    const to = process.env.RECEIVER_EMAIL; // defina no .env
    if (!to) return res.status(500).json({ ok: false, error: 'Receiver not configured' });

    const subject = `Book of Trust — inclusion request from ${handle}`;
    const text =
`Handle: ${handle}
URL: ${url}
Name: ${name}
Contact email: ${email}

Message:
${message}

Meta:
IP: ${ip}
UA: ${ua}
Time: ${new Date().toISOString()}
`;

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@localhost',
      to,
      replyTo: email,
      subject,
      text,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// Fallback para SPA se necessário
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Book of Trust server on http://localhost:${PORT}`);
});

