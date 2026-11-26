# Razorpay Payment Demo

Live Link : https://bucketlistcomponent1w2.onrender.com/

A minimal Node.js and Express application demonstrating Razorpay Standard Checkout in **TEST MODE**. The server creates every order and verifies Razorpay's HMAC SHA256 payment signature before the browser displays success.

No existing project files or frontend were present in the supplied workspace or linked GitHub repository, so this is a complete, small standalone demo. The frontend is plain HTML, CSS, and JavaScript; Express serves it on the same origin as the API, so no CORS configuration is needed.

## Technology stack

- Node.js 20+
- Express 5
- Razorpay Node.js SDK
- dotenv
- Plain HTML, CSS, and browser JavaScript

## Project structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── app.js
│   ├── controllers/
│   │   └── paymentController.js
│   └── routes/
│       └── payment.js
├── test/
│   └── payment.test.js
├── .env.example
├── .gitignore
├── package.json
└── server.js
```

## Installation

```sh
npm install
cp .env.example .env
```

Edit `.env` and add your **TEST MODE** credentials:

```dotenv
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
PORT=5000
```

Get test keys from the Razorpay Dashboard: sign in, switch to **Test Mode**, then open **Account & Settings → API Keys → Generate Test Key**. Keep the secret private. `.env` is ignored by Git; never put the secret in frontend code or commit it.

## Run the application

Start the backend and frontend together:

```sh
npm start
```

Open [http://localhost:5000](http://localhost:5000). For automatic server restarts during development, use `npm run dev`. The frontend is served by Express, so there is no separate frontend process.

Run local automated tests:

```sh
npm test
```

These tests use a fake Razorpay client and generated HMAC signatures. They do not need credentials and do not make real transactions.

## Payment flow

1. The user enters an INR amount and clicks **Pay Now**.
2. The browser calls `POST /api/payment/create-order`.
3. Express validates the rupee amount, converts it to paise, and creates an INR order with the Razorpay SDK on the server.
4. Checkout opens with the returned order ID and public Key ID. The Key Secret is never returned.
5. On Checkout's success callback, the browser sends the order ID, payment ID, and signature to `POST /api/payment/verify`.
6. The server retrieves the order from Razorpay, uses the retrieved order ID to calculate HMAC SHA256 over `order_id|payment_id`, and compares the digest with the supplied signature using `crypto.timingSafeEqual`.
7. The UI displays success only if the backend responds with a verified success. Failed, dismissed, and unverifiable payments show an error instead.

The callback route accepts the same Razorpay fields using JSON or URL-encoded POST bodies. The demo uses Checkout's browser handler rather than redirecting to that route.

## API endpoints

### `POST /api/payment/create-order`

Request:

```json
{ "amount": "10.50" }
```

Amount is in rupees, must be at least ₹1, and may have up to two decimal places. The server converts it to paise before calling Razorpay.

Success (`201`):

```json
{
  "orderId": "order_...",
  "amount": 1050,
  "currency": "INR",
  "keyId": "rzp_test_..."
}
```

Invalid amounts return `400`; missing credentials return `503`; Razorpay order-creation errors return `502`.

### `POST /api/payment/verify`

Request (Razorpay Checkout response):

```json
{
  "razorpay_order_id": "order_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_signature": "..."
}
```

Returns `200` only when the server-fetched order ID and payment ID produce the supplied signature. Missing data or invalid signatures return `400`.

### `POST /api/payment/callback`

Accepts the same order ID, payment ID, and signature fields as `/verify`; supports JSON and URL-encoded form bodies. It uses the same server-side order lookup and signature verification and returns JSON success or failure.

### `GET /api/health`

Returns `{"status":"ok"}` when the server is running.

## Testing Razorpay Checkout

1. Set valid Razorpay **Test Mode** Key ID and Key Secret in `.env`.
2. Run `npm start`, then open `http://localhost:5000`.
3. Enter a small amount and click **Pay Now**.
4. In Checkout, choose a test payment method. For a predictable test, select Netbanking and any listed bank; Razorpay opens a mock bank page with **Success** and **Failure** options. Choose **Success** to verify the server-confirmed success message.
5. Repeat the flow and choose **Failure** to see failed-payment handling, or close the Checkout window before completing payment to see the cancellation state. Razorpay's mock test page does not deduct real money.
6. Run `npm test` to verify local order handling, signature success, malformed/invalid signature rejection, callback verification, and amount validation without making a payment.

If credentials are absent, order creation returns a clear `503` setup error. Invalid or unavailable Razorpay orders cannot be reported as successful.

## Security notes

- Only the Razorpay **Key ID** is sent to Checkout; the Key Secret stays on the server.
- Payment success is never accepted from the browser alone.
- The order ID used to generate the expected digest is fetched from Razorpay rather than trusted from the browser.
- The expected and supplied SHA256 digests are compared with a timing-safe comparison.
- This is an assignment/demo integration. A production system should also persist orders and payment state, verify fulfillment rules, and add operational protections appropriate to its deployment.
