const form = document.querySelector('#payment-form');
const amountInput = document.querySelector('#amount');
const payButton = document.querySelector('#pay-button');
const payButtonLabel = document.querySelector('#pay-button-label');
const paymentStatus = document.querySelector('#payment-status');

let isProcessing = false;
let checkoutState = 'idle';

function setStatus(message, type = '') {
  paymentStatus.textContent = message;
  paymentStatus.className = `status${type ? ` status--${type}` : ''}`;
}

function setProcessing(processing) {
  isProcessing = processing;
  payButton.disabled = processing;
  payButtonLabel.textContent = processing ? 'Preparing secure checkout…' : 'Pay Securely';
}

async function readJsonResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'The payment request failed.');
  }
  return data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isProcessing) {
    return;
  }

  if (typeof window.Razorpay !== 'function') {
    setStatus('Razorpay Checkout did not load. Check your connection and retry.', 'error');
    return;
  }

  setProcessing(true);
  setStatus('Creating a secure order…');

  try {
    const orderResponse = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountInput.value }),
    });
    const order = await readJsonResponse(orderResponse);

    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Vanshika's Project",
      description: 'Secure test payment',
      order_id: order.orderId,
      theme: { color: '#204b3b' },
      handler: async (paymentResponse) => {
        checkoutState = 'verifying';
        setStatus('Payment received. Confirming it securely with the server…');

        try {
          const verificationResponse = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentResponse),
          });
          const verification = await readJsonResponse(verificationResponse);

          if (verification.success !== true) {
            throw new Error('The server could not verify this payment.');
          }

          setStatus('Payment complete — your payment has been securely verified.', 'success');
        } catch (error) {
          setStatus(error.message, 'error');
        } finally {
          checkoutState = 'idle';
          setProcessing(false);
        }
      },
      modal: {
        ondismiss: () => {
          if (checkoutState === 'opening') {
            checkoutState = 'idle';
            setStatus('Checkout closed before payment was completed. You can try again whenever you’re ready.', 'notice');
            setProcessing(false);
          }
        },
      },
    });

    checkout.on('payment.failed', (response) => {
      checkoutState = 'idle';
      const description = response.error?.description || 'Your payment could not be completed.';
      setStatus(`${description} No payment was confirmed. Please check your details or try again.`, 'error');
      setProcessing(false);
    });

    checkoutState = 'opening';
    setStatus('Secure checkout is ready. Complete your payment in the Razorpay window.');
    checkout.open();
  } catch (error) {
    checkoutState = 'idle';
    setStatus(error.message || 'Unable to start the payment. Please try again.', 'error');
    setProcessing(false);
  }
});
