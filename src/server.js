import { loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { createRuntime } from './runtime.js';

const config = loadConfig();
const { jobs, storage, queue, sweep } = createRuntime(config);

if (queue.consume) {
  // Local mode: this process is also the worker, and sweeps expired files like an S3 lifecycle rule.
  queue.consume((message) => jobs.process(message));
  const timer = setInterval(() => sweep().catch((err) => console.error('sweep failed', err)), 60_000);
  timer.unref();
}

const server = createApp({ config, jobs, storage }).listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port: config.port, mode: queue.consume ? 'local' : 'aws' }));
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
