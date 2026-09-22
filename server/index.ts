import { loadConfig } from './config';
import { createRelayServer } from './server';

const config = loadConfig();
const relay = createRelayServer(config);

void relay.listen().then(({ port }) => {
  console.log(`[relay] listening on ${config.host}:${port}`);
});

const stop = (signal: string) => {
  console.log(`[relay] ${signal}, shutting down`);
  void relay.close().then(() => process.exit(0));
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
