const express = require('express');
const path = require('node:path');
const Razorpay = require('razorpay');
const { createPaymentRouter } = require('./routes/payment');

function createApp({
  credentialsProvider = () => ({
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  }),
  razorpayFactory = ({ keyId, keySecret }) =>
    new Razorpay({ key_id: keyId, key_secret: keySecret }),
} = {}) {
  const app = express();

  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(
    '/api/payment',
    createPaymentRouter({ credentialsProvider, razorpayFactory }),
  );
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use((error, _req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof SyntaxError && Object.hasOwn(error, 'body')) {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }

    console.error('Unhandled server error:', error.message);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}

module.exports = { createApp };
