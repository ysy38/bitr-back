const BitredictIndexer = require('../indexer');
const config = require('../config');

console.log('Starting Bitredict Indexer...');
console.log('Configuration:', {
  rpcUrl: config.blockchain.rpcUrl,
  chainId: config.blockchain.chainId,
  startBlock: config.indexer.startBlock,
  batchSize: config.indexer.batchSize,
  pollInterval: config.indexer.pollInterval
});

const indexer = new BitredictIndexer();

indexer.initialize()
  .then(() => {
    console.log('Indexer initialized successfully');
    return indexer.start();
  })
  .catch(error => {
    console.error('Failed to start indexer:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  indexer.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  indexer.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  indexer.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  indexer.stop();
  process.exit(1);
}); 