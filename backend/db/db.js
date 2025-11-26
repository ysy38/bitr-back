const { Pool } = require('pg');
const config = require('../config');
const cache = require('./cache');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Use DATABASE_URL for production (Neon.tech) or construct from individual vars for local dev
      const databaseUrl = process.env.DATABASE_URL;
      
      let poolConfig;
      
      if (databaseUrl) {
        // Production configuration (Neon.tech) - OPTIMIZED FOR COST REDUCTION
        poolConfig = {
          connectionString: databaseUrl,
          ssl: { rejectUnauthorized: false }, // Required for Neon.tech
          
          // OPTIMIZED CONNECTION POOL SETTINGS
          max: 5, // Reduced from 10 (fewer concurrent connections)
          min: 0, // No minimum connections (allows complete idle)
          
          // CRITICAL FOR AUTOSUSPEND - Balanced timeouts
          idleTimeoutMillis: 30000, // 30 seconds - close idle connections quickly
          connectionTimeoutMillis: 30000, // 30 seconds - MUST allow for cold start wake-up
          acquireTimeoutMillis: 30000, // 30 seconds - allow time for connection acquisition
          
          // MOST IMPORTANT: Allow pool to fully close when idle (ENABLES AUTOSUSPEND)
          allowExitOnIdle: true, // CRITICAL - allows Neon to suspend
          
          // Statement timeout (prevent long-running queries)
          statement_timeout: 30000, // 30 seconds max per query
          query_timeout: 30000, // 30 seconds
          
          // Application name for monitoring
          application_name: 'bitredict-backend',
          
          // Add connection error handling
          onConnect: (client) => {
            client.on('error', (err) => {
              console.error('Database client error:', err);
            });
          },
          
          // Add connection pool monitoring
          onAcquire: (client) => {
            console.log(`🔗 Database connection acquired. Pool size: ${this.pool.totalCount}, idle: ${this.pool.idleCount}, waiting: ${this.pool.waitingCount}`);
          },
          
          onRemove: (client) => {
            console.log(`🔌 Database connection removed. Pool size: ${this.pool.totalCount}, idle: ${this.pool.idleCount}, waiting: ${this.pool.waitingCount}`);
          }
        };
      } else {
        // Local development configuration - OPTIMIZED
        poolConfig = {
          user: process.env.DB_USER || 'postgres',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'bitredict_db',
          password: process.env.DB_PASSWORD || 'password',
          port: process.env.DB_PORT || 5432,
          ssl: false,
          
          // OPTIMIZED CONNECTION POOL SETTINGS
          max: 5, // Reduced from 10
          min: 0, // No minimum connections
          
          // Short timeouts for better resource management
          idleTimeoutMillis: 30000, // 30 seconds
          connectionTimeoutMillis: 5000, // 5 seconds
          acquireTimeoutMillis: 5000, // 5 seconds
          
          // Allow pool to close when idle
          allowExitOnIdle: true,
          
          // Statement timeout
          statement_timeout: 30000,
          query_timeout: 30000,
          
          // Application name
          application_name: 'bitredict-backend-dev',
          
          // Add connection error handling
          onConnect: (client) => {
            client.on('error', (err) => {
              console.error('Database client error:', err);
            });
          }
        };
      }

      this.pool = new Pool(poolConfig);
      
      // ✅ CRITICAL FIX: Add global error handlers for pool to prevent uncaught exceptions
      this.pool.on('error', (err, client) => {
        // Handle connection errors that occur outside of queries
        if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
          console.warn(`⚠️ Database pool connection error (${err.code}):`, err.message);
          // Remove the bad client from the pool
          if (client) {
            client.end().catch(() => {
              // Ignore cleanup errors
            });
          }
        } else {
          console.error('❌ Unexpected database pool error:', err);
        }
      });
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      console.log('✅ Database connected successfully');
      
      // Start connection keep-alive for critical services (optional)
      // This pings the database periodically to prevent auto-suspend during active hours
      // Disabled by default - enable if needed for critical services
      if (process.env.ENABLE_DB_KEEPALIVE === 'true') {
        this.startKeepAlive();
      }
      
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Keep-alive mechanism to prevent auto-suspend during critical periods
   * Only use for critical services that need guaranteed uptime
   */
  startKeepAlive() {
    if (this.keepAliveInterval) {
      return; // Already running
    }
    
    // Ping database every 4 minutes (well before 5-minute auto-suspend)
    this.keepAliveInterval = setInterval(async () => {
      try {
        await this.query('SELECT 1 as keepalive');
        console.log('💓 Database keep-alive ping');
      } catch (error) {
        console.warn('⚠️ Keep-alive ping failed:', error.message);
      }
    }, 4 * 60 * 1000); // 4 minutes
    
    console.log('💓 Database keep-alive started (4-minute interval)');
  }

  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      console.log('💤 Database keep-alive stopped');
    }
  }

  async disconnect() {
    this.stopKeepAlive(); // Stop keep-alive if running
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('✅ Database disconnected gracefully');
    }
  }

  async query(text, params = [], retries = 3) {
    if (!this.isConnected) {
      await this.connect();
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      let client = null;
      let timeoutHandle = null;
      let clientErrorHandler = null;
      try {
        // ✅ CRITICAL FIX: Add timeout wrapper to catch ETIMEDOUT at query level
        client = await this.pool.connect();
        
        // ✅ Add error handler to client to catch stream-level errors
        clientErrorHandler = (err) => {
          if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
            console.warn(`⚠️ Database client stream error (${err.code}):`, err.message);
          }
        };
        client.on('error', clientErrorHandler);
        
        try {
          // ✅ Add timeout to the query itself (60 seconds max for long queries)
          const queryPromise = client.query(text, params);
          const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error('Query timeout after 60 seconds'));
            }, 60000);
          });
          
          const result = await Promise.race([queryPromise, timeoutPromise]);
          
          // Clear timeout if query completed
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          
          // Clean up error handler
          if (clientErrorHandler) {
            client.removeListener('error', clientErrorHandler);
          }
          client.release();
          
          return result;
        } catch (queryError) {
          // Clear timeout on error
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          
          // Clean up error handler
          if (clientErrorHandler) {
            client.removeListener('error', clientErrorHandler);
          }
          
          // Release client before checking error type
          try {
            client.release();
          } catch (releaseError) {
            // Ignore release errors for bad connections
          }
          
          throw queryError;
        }
      } catch (error) {
        // Clean up client if it was acquired but not released
        if (client && clientErrorHandler) {
          try {
            client.removeListener('error', clientErrorHandler);
            client.release();
          } catch (releaseError) {
            // Ignore release errors for bad connections
          }
        }
        
        // Clean up timeout if it exists
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        
        // Handle connection errors during cold start
        const isConnectionError = error.code === 'ECONNREFUSED' || 
                                 error.code === 'ETIMEDOUT' ||
                                 error.code === 'ECONNRESET' ||
                                 error.code === 'EPIPE' ||
                                 error.message?.includes('timeout') ||
                                 error.message?.includes('connect') ||
                                 error.message?.includes('Query timeout');
        
        if (isConnectionError && attempt < retries) {
          const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
          console.warn(`⚠️ Database query failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
          console.warn(`   Error: ${error.code || error.message}`);
          
          // Mark connection as potentially bad and reconnect
          this.isConnected = false;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to reconnect
          try {
            await this.connect();
          } catch (reconnectError) {
            console.warn(`   Reconnection failed: ${reconnectError.message}`);
          }
          continue;
        }
        
        // If not a connection error or final attempt, throw
        console.error('❌ Database query error:', error.code || error.message);
        console.error('Query:', text.substring(0, 200)); // Truncate long queries
        throw error;
      }
    }
    
    // Should never reach here, but TypeScript/ESLint might complain
    throw new Error('Database query failed after all retries');
  }

  /**
   * Cached query method - reduces database load
   * Use for frequently accessed, rarely changing data
   */
  async cachedQuery(text, params = [], ttl = null) {
    // Check cache first
    const cached = cache.get(text, params);
    if (cached) {
      return cached;
    }

    // Execute query if not cached
    const result = await this.query(text, params);
    
    // Cache the result (only cache successful SELECT queries)
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      cache.set(text, params, result, ttl);
    }
    
    return result;
  }

  async transaction(callback) {
    if (!this.isConnected) {
      await this.connect();
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // User operations
  async createUser(address) {
    const query = `
      INSERT INTO core.users (address)
      VALUES ($1)
      ON CONFLICT (address) DO UPDATE SET last_active = NOW()
      RETURNING *
    `;
    const result = await this.query(query, [address]);
    return result.rows[0];
  }

  async getUser(address) {
    const query = 'SELECT * FROM core.users WHERE address = $1';
    const result = await this.cachedQuery(query, [address], 2 * 60 * 1000); // 2 minutes cache
    return result.rows[0];
  }

  // Reputation operations
  async addReputationLog(userAddress, action, delta, refType = null, refId = null) {
    const query = `
      INSERT INTO core.reputation_actions (user_address, action, points, ref_type, ref_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.query(query, [userAddress, action, delta, refType, refId]);
    return result.rows[0];
  }

  async getUserReputation(userAddress) {
    const query = `
      SELECT COALESCE(SUM(points), 0) as total_reputation
      FROM core.reputation_actions
      WHERE user_address = $1
    `;
    const result = await this.cachedQuery(query, [userAddress], 5 * 60 * 1000); // 5 minutes cache
    return parseInt(result.rows[0]?.total_reputation || 0);
  }

  // Oracle operations
  async saveMatch(matchId, homeTeam, awayTeam, matchTime, league) {
    const query = `
      INSERT INTO oracle.matches (match_id, home_team, away_team, match_time, league)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (match_id) DO UPDATE SET
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        match_time = EXCLUDED.match_time,
        league = EXCLUDED.league
      RETURNING *
    `;
    const result = await this.query(query, [matchId, homeTeam, awayTeam, matchTime, league]);
    return result.rows[0];
  }

  async saveMatchResult(matchId, results) {
    // First check if the match exists in the matches table (using external match_id, not internal id)
    const matchExists = await this.query(
      'SELECT 1 FROM oracle.matches WHERE match_id = $1',
      [matchId]
    );
    
    if (matchExists.rows.length === 0) {
      console.log(`⚠️ Match ${matchId} does not exist in matches table, skipping result save`);
      return null;
    }

    const query = `
      INSERT INTO oracle.match_results (
        id, match_id, home_score, away_score, ht_home_score, ht_away_score,
        outcome_1x2, outcome_ou05, outcome_ou15, outcome_ou25, outcome_ou35,
        outcome_ht_result, outcome_btts, full_score, ht_score,
        state_id, result_info, finished_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (match_id) DO UPDATE SET
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        ht_home_score = EXCLUDED.ht_home_score,
        ht_away_score = EXCLUDED.ht_away_score,
        outcome_1x2 = EXCLUDED.outcome_1x2,
        outcome_ou05 = EXCLUDED.outcome_ou05,
        outcome_ou15 = EXCLUDED.outcome_ou15,
        outcome_ou25 = EXCLUDED.outcome_ou25,
        outcome_ou35 = EXCLUDED.outcome_ou35,
        outcome_ht_result = EXCLUDED.outcome_ht_result,
        outcome_btts = EXCLUDED.outcome_btts,
        full_score = EXCLUDED.full_score,
        ht_score = EXCLUDED.ht_score,
        state_id = EXCLUDED.state_id,
        result_info = EXCLUDED.result_info,
        finished_at = EXCLUDED.finished_at,
        resolved_at = NOW()
      RETURNING *
    `;
    const params = [
      `match_result_${matchId}`, // Generate ID for match_results table
      matchId,
      results.home_score,
      results.away_score,
      results.ht_home_score,
      results.ht_away_score,
      results.outcome_1x2,
      results.outcome_ou05,
      results.outcome_ou15,
      results.outcome_ou25,
      results.outcome_ou35,
      results.outcome_ht_result,
      results.outcome_btts,
      results.full_score,
      results.ht_score,
      results.state_id,
      results.result_info,
      results.finished_at
    ];
    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Oddyssey operations
  async createDailyGame(gameDate, entryFee) {
    const query = `
      INSERT INTO oddyssey.daily_games (game_date, entry_fee)
      VALUES ($1, $2)
      ON CONFLICT (game_date) DO UPDATE SET entry_fee = EXCLUDED.entry_fee
      RETURNING *
    `;
    const result = await this.query(query, [gameDate, entryFee]);
    return result.rows[0];
  }

  async saveSlip(slipData) {
    return await this.transaction(async (client) => {
      // Insert slip
      const slipQuery = `
        INSERT INTO oracle.oddyssey_slips (player_address, placed_at, predictions)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const slipResult = await client.query(slipQuery, [
        slipData.user_address,
        slipData.game_date,
        slipData.total_odds
      ]);
      const slip = slipResult.rows[0];

      // Insert slip entries
      for (const entry of slipData.entries) {
        const entryQuery = `
          INSERT INTO oddyssey.slip_entries (
            slip_id, match_id, bet_type, selected_outcome, selected_odd
          ) VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(entryQuery, [
          slip.slip_id,
          entry.match_id,
          entry.bet_type,
          entry.selected_outcome,
          entry.selected_odd
        ]);
      }

      return slip;
    });
  }

  // Analytics queries
  async getDailyStats(date) {
    const query = `
      SELECT 
        COUNT(s.slip_id) as total_slips,
        COUNT(DISTINCT s.player_address) as unique_players,
        0 as total_volume,
        0 as avg_odds
      FROM oracle.oddyssey_cycles c
      LEFT JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
      WHERE DATE(c.created_at) = $1
      GROUP BY DATE(c.created_at)
    `;
    const result = await this.query(query, [date]);
    return result.rows[0];
  }

  async getLeaderboard(limit = 10) {
    const query = `
      SELECT 
        player_address as user_address,
        COUNT(slip_id) as total_slips,
        SUM(COALESCE(final_score, 0)) as total_score,
        AVG(COALESCE(correct_count, 0)) as avg_correct,
        MAX(COALESCE(odds, 0)) as highest_odds
      FROM oracle.oddyssey_slips
      WHERE is_evaluated = TRUE AND COALESCE(final_score, 0) > 0
      GROUP BY player_address
      ORDER BY total_score DESC
      LIMIT $1
    `;
    const result = await this.cachedQuery(query, [limit], 10 * 60 * 1000); // 10 minutes cache
    return result.rows;
  }

  /**
   * Clear cache for specific patterns
   * Call this after data modifications to ensure cache consistency
   */
  clearCache(pattern = null) {
    cache.clear(pattern);
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return cache.getStats();
  }
}

// Export singleton instance
const db = new Database();

// Graceful shutdown handlers for proper connection cleanup
process.on('SIGINT', async () => {
  console.log('🛑 Gracefully closing database connections...');
  await db.disconnect();
  console.log('✅ Database connections closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Gracefully closing database connections...');
  await db.disconnect();
  console.log('✅ Database connections closed');
  process.exit(0);
});

module.exports = db; 