const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');
const { createApp } = require('../src/app');
const {
  amountToPaise,
  verifyRazorpaySignature,
} = require('../src/controllers/paymentController');

const keyId = 'rzp_test_example';
const keySecret = 'test-secret-for-unit-tests';
const orderId = 'order_test_123';
const paymentId = 'pay_test_456';
let server;
let baseUrl;
let createdOrderOptions;

const fakeRazorpay = {
  orders: {
    create: async (options) => {
      createdOrderOptions = options;
      return { id: orderId, amount: options.amount, currency: options.currency };
    },
    fetch: async (id) => ({ id }),
  },
};

function signatureFor(order, payment) {
  return crypto
    .createHmac('sha256', keySecret)
    .update(`${order}|${payment}`)
    .digest('hex');
}

async function postJson(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  const app = createApp({
    credentialsProvider: () => ({ keyId, keySecret }),
    razorpayFactory: () => fakeRazorpay,
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('converts valid INR amounts to paise and rejects invalid amounts', () => {
  assert.equal(amountToPaise('12.34'), 1234);
  assert.equal(amountToPaise(10), 1000);
  assert.equal(amountToPaise('0'), null);
  assert.equal(amountToPaise('0.99'), null);
  assert.equal(amountToPaise('-2'), null);
  assert.equal(amountToPaise('2.999'), null);
  assert.equal(amountToPaise('not-an-amount'), null);
});

test('creates a server-side INR order and only returns the public key ID', async () => {
  const response = await postJson('/api/payment/create-order', { amount: '12.34' });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(createdOrderOptions.amount, 1234);
  assert.equal(createdOrderOptions.currency, 'INR');
  assert.equal(body.orderId, orderId);
  assert.equal(body.amount, 1234);
  assert.equal(body.currency, 'INR');
  assert.equal(body.keyId, keyId);
  assert.equal(JSON.stringify(body).includes(keySecret), false);
});

test('rejects invalid order amounts', async () => {
  const response = await postJson('/api/payment/create-order', { amount: '-1' });
  assert.equal(response.status, 400);
});

test('accepts a valid signature made with the original fetched order ID', async () => {
  const response = await postJson('/api/payment/verify', {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signatureFor(orderId, paymentId),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.orderId, orderId);
});

test('rejects invalid signatures', async () => {
  const response = await postJson('/api/payment/verify', {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: '0'.repeat(64),
  });
  assert.equal(response.status, 400);
});

test('accepts callback form fields only after signature verification', async () => {
  const response = await fetch(`${baseUrl}/api/payment/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signatureFor(orderId, paymentId),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('returns a useful error when Razorpay credentials are missing', async () => {
  const app = createApp({
    credentialsProvider: () => ({}),
    razorpayFactory: () => fakeRazorpay,
  });
  const missingCredentialsServer = app.listen(0);
  await new Promise((resolve) => missingCredentialsServer.once('listening', resolve));

  try {
    const response = await fetch(
      `http://127.0.0.1:${missingCredentialsServer.address().port}/api/payment/create-order`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: '10' }),
      },
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.match(body.error, /RAZORPAY_KEY_ID/);
  } finally {
    await new Promise((resolve, reject) => {
      missingCredentialsServer.close((error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
});

test('rejects malformed signatures before comparing them', () => {
  assert.equal(
    verifyRazorpaySignature(orderId, paymentId, 'not-a-hex-signature', keySecret),
    false,
  );
});
