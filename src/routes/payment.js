const express = require('express');
const { createPaymentController } = require('../controllers/paymentController');

function createPaymentRouter(dependencies) {
  const router = express.Router();
  const controller = createPaymentController(dependencies);

  router.post('/create-order', controller.createOrder);
  router.post('/verify', controller.verifyPayment);
  router.post('/callback', controller.verifyPayment);

  return router;
}

module.exports = { createPaymentRouter };
