const db = require('./db');
const LoggingMiddleware = require('../middleware/logging-middleware');
const healthMonitor = require('../services/system-monitor');

/**
 * Database Connection Monitoring Wrapper
 * Implements Requirement 6.3: Database connection monitoring
 */
class MonitoredDatabase {
  constructor() {
    this.originalDb = db;
    this.connectionHealth = {
      isHealthy: false,
      lastCheck: null,
      consecutiveFailures: 0,
      totalQueries: 0,
      totalErrors: 0
    };
    
    // Wrap the original query method with logging
    this.originalDb.query = LoggingMiddleware.databaseQueryLogger(this.originalDb.query.bind(this.originalDb));
  }

  /**
   * Enhanced connect method with monitoring
   */
  async connect() {
    try {
      healthMonitor.logInfo('Attempting database connection');
      await this.originalDb.connect();
      
      this.connectionHealth.isHealthy = true;
      this.connectionHealth.lastCheck = new Date();
      this.connectionHealth.consecutiveFailures = 0;
      
      healthMonitor.logInfo('Database connection established successfully');
      return true;
    } catch (error) {
      this.connectionHealth.isHealthy = false;
      this.connectionHealth.consecutiveFailures++;
      
      healthMonitor.logError('Database connection failed', error, {
        consecutiveFailures: this.connectionHealth.consecutiveFailures
      });
      
      throw error;
    }
  }

  /**
   * Enhanced disconnect method with monitoring
   */
  async disconnect() {
    try {
      await this.originalDb.disconnect();
      this.connectionHealth.isHealthy = false;
      healthMonitor.logInfo('Database disconnected successfully');
    } catch (error) {
      healthMonitor.logError('Database disconnect failed', error);
      throw error;
    }
  }

  /**
   * Enhanced query method with monitoring and retry logic
   */
  async query(text, params = []) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check connection health before query
        if (!this.connectionHealth.isHealthy && attempt === 1) {
          healthMonitor.logWarning('Database connection unhealthy, attempting reconnection');
          await this.connect();
        }

        const result = await this.originalDb.query(text, params);
        
        // Update health status on successful query
        this.connectionHealth.isHealthy = true;
        this.connectionHealth.consecutiveFailures = 0;
        this.connectionHealth.totalQueries++;
        
        return result;

      } catch (error) {
        lastError = error;
        this.connectionHealth.totalErrors++;
        this.connectionHealth.consecutiveFailures++;

        // Log the error with context
        healthMonitor.logError(`Database query failed (attempt ${attempt}/${maxRetries})`, error, {
          query: text.substring(0, 100),
          attempt,
          consecutiveFailures: this.connectionHealth.consecutiveFailures
        });

        // If it's a connection error, try to reconnect
        if (this.isConnectionError(error) && attempt < maxRetries) {
          healthMonitor.logWarning(`Connection error detected, attempting reconnection (attempt ${attempt})`);
          this.connectionHealth.isHealthy = false;
          
          try {
            await this.connect();
          } catch (reconnectError) {
            healthMonitor.logError('Reconnection failed', reconnectError);
          }
          
          // Wait before retry
          await this.sleep(1000 * attempt);
        } else if (attempt === maxRetries) {
          // Mark connection as unhealthy after max retries
          this.connectionHealth.isHealthy = false;
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Enhanced transaction method with monitoring
   */
  async transaction(callback) {
    const transactionId = Math.random().toString(36).substring(2, 15);
    
    healthMonitor.logInfo('Starting database transaction', { transactionId });
    
    try {
      const result = await this.originalDb.transaction(callback);
      
      healthMonitor.logInfo('Database transaction completed successfully', { transactionId });
      return result;
      
    } catch (error) {
      healthMonitor.logError('Database transaction failed', error, { transactionId });
      throw error;
    }
  }

  /**
   * Connection health check
   */
  async checkConnectionHealth() {
    try {
      const startTime = Date.now();
      await this.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;
      
      this.connectionHealth.isHealthy = true;
      this.connectionHealth.lastCheck = new Date();
      this.connectionHealth.consecutiveFailures = 0;
      
      return {
        isHealthy: true,
        responseTime,
        lastCheck: this.connectionHealth.lastCheck,
        consecutiveFailures: 0
      };
      
    } catch (error) {
      this.connectionHealth.isHealthy = false;
      this.connectionHealth.consecutiveFailures++;
      
      return {
        isHealthy: false,
        error: error.message,
        lastCheck: new Date(),
        consecutiveFailures: this.connectionHealth.consecutiveFailures
      };
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      ...this.connectionHealth,
      errorRate: this.connectionHealth.totalQueries > 0 ? 
        (this.connectionHealth.totalErrors / this.connectionHealth.totalQueries) * 100 : 0,
      poolStats: this.originalDb.pool ? {
        totalCount: this.originalDb.pool.totalCount,
        idleCount: this.originalDb.pool.idleCount,
        waitingCount: this.originalDb.pool.waitingCount
      } : null
    };
  }

  /**
   * Check if error is connection-related
   */
  isConnectionError(error) {
    const connectionErrorCodes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'CONNECTION_TERMINATED',
      'CONNECTION_DOES_NOT_EXIST'
    ];
    
    return connectionErrorCodes.some(code => 
      error.code === code || error.message.includes(code)
    );
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Proxy all other methods to original db
  createUser(...args) {
    return this.originalDb.createUser(...args);
  }

  getUser(...args) {
    return this.originalDb.getUser(...args);
  }

  addReputationLog(...args) {
    return this.originalDb.addReputationLog(...args);
  }

  getUserReputation(...args) {
    return this.originalDb.getUserReputation(...args);
  }

  saveMatch(...args) {
    return this.originalDb.saveMatch(...args);
  }

  saveMatchResult(...args) {
    return this.originalDb.saveMatchResult(...args);
  }

  createDailyGame(...args) {
    return this.originalDb.createDailyGame(...args);
  }

  saveSlip(...args) {
    return this.originalDb.saveSlip(...args);
  }

  getDailyStats(...args) {
    return this.originalDb.getDailyStats(...args);
  }

  getLeaderboard(...args) {
    return this.originalDb.getLeaderboard(...args);
  }

  // Expose pool and connection status
  get pool() {
    return this.originalDb.pool;
  }

  get isConnected() {
    return this.originalDb.isConnected;
  }
}

// Export singleton instance
const monitoredDb = new MonitoredDatabase();
module.exports = monitoredDb;