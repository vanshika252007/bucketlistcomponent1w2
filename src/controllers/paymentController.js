const crypto = require('node:crypto');

function amountToPaise(amount) {
  if (typeof amount !== 'number' && typeof amount !== 'string') {
    return null;
  }

  const amountString = String(amount);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountString)) {
    return null;
  }

  const [wholePart, fractionalPart = ''] = amountString.split('.');
  const paise =
    Number(wholePart) * 100 + Number(fractionalPart.padEnd(2, '0'));

  return Number.isSafeInteger(paise) && paise >= 100 ? paise : null;
}

function hasRequiredCredentials(credentials) {
  return Boolean(credentials?.keyId && credentials?.keySecret);
}

function verifyRazorpaySignature(orderId, paymentId, receivedSignature, keySecret) {
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof receivedSignature !== 'string' ||
    !/^[a-f\d]{64}$/i.test(receivedSignature)
  ) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const signatureBuffer = Buffer.from(receivedSignature, 'hex');

  return (
    signatureBuffer.length === expectedSignature.length &&
    crypto.timingSafeEqual(expectedSignature, signatureBuffer)
  );
}

function createPaymentController({ credentialsProvider, razorpayFactory }) {
  function getPaymentContext(res) {
    const credentials = credentialsProvider();
    if (!hasRequiredCredentials(credentials)) {
      res.status(503).json({
        error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      });
      return null;
    }

    return {
      credentials,
      razorpay: razorpayFactory(credentials),
    };
  }

  async function createOrder(req, res) {
    const amount = amountToPaise(req.body?.amount);
    if (amount === null) {
      return res.status(400).json({
        error: 'Amount must be a positive INR amount with at most two decimal places.',
      });
    }

    try {
      const context = await getPaymentContext(res);
      if (!context) {
        return;
      }

      const order = await context.razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: crypto.randomUUID(),
      });

      return res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: context.credentials.keyId,
      });
    } catch (error) {
      console.error('Razorpay order creation failed:', error.message);
      return res.status(502).json({
        error: 'Razorpay could not create the order. Check your test credentials and try again.',
      });
    }
  }

  async function verifyPayment(req, res) {
    const {
      razorpay_order_id: submittedOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body ?? {};

    if (
      typeof submittedOrderId !== 'string' ||
      typeof paymentId !== 'string' ||
      typeof signature !== 'string'
    ) {
      return res.status(400).json({
        error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required.',
      });
    }

    try {
      const context = await getPaymentContext(res);
      if (!context) {
        return;
      }

      const order = await context.razorpay.orders.fetch(submittedOrderId);
      if (!order?.id || order.id !== submittedOrderId) {
        return res.status(400).json({ error: 'The Razorpay order could not be verified.' });
      }

      const isValid = verifyRazorpaySignature(
        order.id,
        paymentId,
        signature,
        context.credentials.keySecret,
      );
      if (!isValid) {
        return res.status(400).json({ error: 'Payment signature is invalid.' });
      }

      return res.json({
        success: true,
        message: 'Payment signature verified successfully.',
        orderId: order.id,
        paymentId,
      });
    } catch (error) {
      console.error('Razorpay payment verification failed:', error.message);
      return res.status(502).json({
        error: 'Razorpay could not verify the order. Confirm the order ID and try again.',
      });
    }
  }

  return { createOrder, verifyPayment };
}

module.exports = {
  amountToPaise,
  createPaymentController,
  verifyRazorpaySignature,
};
