require('dotenv').config();

const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 5000;
const app = createApp();

app.listen(port, () => {
  console.log(`Payment demo server listening on http://localhost:${port}`);
});
