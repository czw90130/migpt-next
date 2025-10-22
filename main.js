import { MiGPT } from './apps/next/dist/index.js';
import config from './config/config.js';

// Gracefully shutdown
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log('正在关闭服务...');
    await MiGPT.stop();
    process.exit(0);
  });
}

async function main() {
  try {
    await MiGPT.start(config);
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

main();
