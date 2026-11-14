import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const server = createApp({
  dbFile: process.env.DB_FILE || './data/app.db',
  secret: process.env.SESSION_SECRET,
  domain: process.env.MAIL_DOMAIN || 'muscat.example',
  cookieSecure: process.env.COOKIE_SECURE === '1',
});
server.listen(port, '0.0.0.0', () => {
  console.log(`listening on http://localhost:${port}`);
});
