/**
 * Optimized Database Connection Pool
 * Implements cost-saving measures for Neon.tech
 */

const { Pool } = require('pg');

// Optimized pool configuration for Neon.tech
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  
  // Connection pool settings (OPTIMIZED for cost reduction)
  max: 5, // Reduced from default 10 (fewer concurrent connections)
  min: 0, // No minimum connections (allows complete idle)
  
  // Timeout settings (CRITICAL for autosuspend)
  idleTimeoutMillis: 30000, // 30 seconds - close idle connections quickly
  connectionTimeoutMillis: 5000, // 5 seconds - fail fast if can't connect
  
  // Allow pool to fully close when idle (ENABLES AUTOSUSPEND)
  allowExitOnIdle: true, // **MOST IMPORTANT** - allows Neon to suspend
  
  // Application name for monitoring
  application_name: 'bitredict-backend',
  
  // Statement timeout (prevent long-running queries)
  statement_timeout: 30000, // 30 seconds max per query
  
  // Query timeout
  query_timeout: 30000, // 30 seconds
};

// Create optimized pool
const pool = new Pool(poolConfig);

// Pool event handlers for monitoring
pool.on('connect', (client) => {
  console.log('🔌 New database connection established');
});

pool.on('acquire', (client) => {
  // console.log('🔓 Connection acquired from pool');
});

pool.on('remove', (client) => {
  console.log('🔌 Connection removed from pool');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected pool error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Gracefully closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Gracefully closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

module.exports = pool;

/**
 * Usage Example:
 * 
 * const pool = require('./db/optimize-connection-pool');
 * 
 * async function query(text, params) {
 *   const client = await pool.connect();
 *   try {
 *     const result = await client.query(text, params);
 *     return result;
 *   } finally {
 *     client.release(); // ALWAYS release!
 *   }
 * }
 */

