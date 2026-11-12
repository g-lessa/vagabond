import { getLanUrls, tunnelManager } from './config.js';
import { createVagabondServer } from './app.js';

const isProd = process.env.NODE_ENV === 'production';
const publicPort = Number(process.env.PORT) || 3000;
const serverPort = isProd ? publicPort : 3001;

const { httpServer } = createVagabondServer({
  publicPort,
  serveStatic: isProd,
});

httpServer.listen(serverPort, '0.0.0.0', () => {
  console.log(
    `[Vagabond] Server listening on port ${serverPort} (public app port ${publicPort})`,
  );
  const lans = getLanUrls(publicPort);
  if (lans.length > 0) {
    console.log(`[Vagabond] LAN URL(s): ${lans.join(', ')}`);
  }
});

function shutdown() {
  tunnelManager.stop();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
