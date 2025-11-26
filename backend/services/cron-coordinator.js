const db = require('../db/db');

/**
 * Cron Job Coordination Service
 * Provides database-based locking mechanism to prevent concurrent execution
 * and ensures proper execution order with dependencies
 */
class CronCoordinator {
  constructor() {
    this.lockTimeout = 30 * 60 * 1000; // 30 minutes default timeout
    this.retryAttempts = 3;
    this.baseRetryDelay = 1000; // 1 second base delay
  }

  /**
   * Initialize the coordinator by creating necessary database tables
   */
  async initialize() {
    try {
      // Create system schema if it doesn't exist
      await db.query(`CREATE SCHEMA IF NOT EXISTS system`);
      
      // Create cron_locks table
      await db.query(`
        CREATE TABLE IF NOT EXISTS system.cron_locks (
          job_name VARCHAR(100) PRIMARY KEY,
          locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
          locked_by VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          execution_id UUID DEFAULT gen_random_uuid(),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create cron_execution_log table for monitoring
      await db.query(`
        CREATE TABLE IF NOT EXISTS system.cron_execution_log (
          id SERIAL PRIMARY KEY,
          job_name VARCHAR(100) NOT NULL,
          execution_id UUID NOT NULL,
          status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed', 'timeout'
          started_at TIMESTAMP NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP,
          duration_ms INTEGER,
          error_message TEXT,
          metadata JSONB DEFAULT '{}'::jsonb
        )
      `);

      // Create index for performance
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_cron_execution_log_job_started 
        ON system.cron_execution_log(job_name, started_at DESC)
      `);

      console.log('✅ Cron coordinator initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize cron coordinator:', error);
      throw error;
    }
  }

  /**
   * Acquire a lock for a specific job
   * @param {string} jobName - Name of the cron job
   * @param {number} timeoutMs - Lock timeout in milliseconds
   * @param {object} metadata - Additional metadata to store with the lock
   * @returns {Promise<string|null>} - Execution ID if lock acquired, null if failed
   */
  async acquireLock(jobName, timeoutMs = this.lockTimeout, metadata = {}) {
    try {
      const lockerId = `${process.env.HOSTNAME || 'unknown'}-${process.pid}`;
      const expiresAt = new Date(Date.now() + timeoutMs);

      // Clean up expired locks first
      await this.cleanupExpiredLocks();

      // Try to acquire lock
      const result = await db.query(`
        INSERT INTO system.cron_locks (job_name, locked_by, expires_at, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (job_name) DO NOTHING
        RETURNING execution_id
      `, [jobName, lockerId, expiresAt, JSON.stringify(metadata)]);

      if (result.rows.length > 0) {
        const executionId = result.rows[0].execution_id;
        
        // Log the start of execution
        await db.query(`
          INSERT INTO system.cron_execution_log (job_name, execution_id, status, metadata)
          VALUES ($1, $2, 'started', $3)
        `, [jobName, executionId, JSON.stringify(metadata)]);

        console.log(`🔒 Lock acquired for job: ${jobName} (${executionId})`);
        return executionId;
      } else {
        console.log(`⚠️ Lock already exists for job: ${jobName}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Failed to acquire lock for job ${jobName}:`, error);
      return null;
    }
  }

  /**
   * Release a lock for a specific job
   * @param {string} jobName - Name of the cron job
   * @param {string} executionId - Execution ID returned from acquireLock
   * @param {string} status - Final status ('completed' or 'failed')
   * @param {string} errorMessage - Error message if status is 'failed'
   */
  async releaseLock(jobName, executionId, status = 'completed', errorMessage = null) {
    try {
      // Remove the lock
      const result = await db.query(`
        DELETE FROM system.cron_locks 
        WHERE job_name = $1 AND execution_id = $2
        RETURNING locked_at
      `, [jobName, executionId]);

      if (result.rows.length > 0) {
        const lockedAt = new Date(result.rows[0].locked_at);
        const duration = Date.now() - lockedAt.getTime();

        // Update execution log
        await db.query(`
          UPDATE system.cron_execution_log 
          SET status = $1, completed_at = NOW(), duration_ms = $2, error_message = $3
          WHERE job_name = $4 AND execution_id = $5
        `, [status, duration, errorMessage, jobName, executionId]);

        console.log(`🔓 Lock released for job: ${jobName} (${executionId}) - ${status}`);
      }
    } catch (error) {
      console.error(`❌ Failed to release lock for job ${jobName}:`, error);
    }
  }

  /**
   * Check if a job is currently locked
   * @param {string} jobName - Name of the cron job
   * @returns {Promise<boolean>} - True if locked, false otherwise
   */
  async isLocked(jobName) {
    try {
      await this.cleanupExpiredLocks();
      
      const result = await db.query(`
        SELECT 1 FROM system.cron_locks 
        WHERE job_name = $1 AND expires_at > NOW()
      `, [jobName]);

      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Failed to check lock status for job ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Wait for a dependency job to complete before proceeding
   * @param {string} dependencyJobName - Name of the job to wait for
   * @param {number} maxWaitMs - Maximum time to wait in milliseconds
   * @param {number} checkIntervalMs - How often to check in milliseconds
   * @returns {Promise<boolean>} - True if dependency completed, false if timeout
   */
  async waitForDependency(dependencyJobName, maxWaitMs = 10 * 60 * 1000, checkIntervalMs = 30000) {
    const startTime = Date.now();
    
    console.log(`⏳ Waiting for dependency: ${dependencyJobName}`);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check if dependency job is still running
        const isRunning = await this.isLocked(dependencyJobName);
        
        if (!isRunning) {
          // Check if the dependency completed successfully in the last hour
          const result = await db.query(`
            SELECT status FROM system.cron_execution_log 
            WHERE job_name = $1 
            AND started_at > NOW() - INTERVAL '1 hour'
            ORDER BY started_at DESC 
            LIMIT 1
          `, [dependencyJobName]);

          if (result.rows.length > 0) {
            const status = result.rows[0].status;
            if (status === 'completed') {
              console.log(`✅ Dependency completed: ${dependencyJobName}`);
              return true;
            } else if (status === 'failed') {
              console.log(`❌ Dependency failed: ${dependencyJobName}`);
              return false;
            }
          }
          
          // If no recent execution found, assume it's safe to proceed
          console.log(`ℹ️ No recent execution found for ${dependencyJobName}, proceeding`);
          return true;
        }

        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      } catch (error) {
        console.error(`❌ Error waiting for dependency ${dependencyJobName}:`, error);
        return false;
      }
    }

    console.log(`⏰ Timeout waiting for dependency: ${dependencyJobName}`);
    return false;
  }

  /**
   * Execute a job with coordination, locking, and retry logic
   * @param {string} jobName - Name of the cron job
   * @param {Function} jobFunction - Function to execute
   * @param {object} options - Execution options
   * @returns {Promise<any>} - Result of job execution
   */
  async executeWithCoordination(jobName, jobFunction, options = {}) {
    const {
      dependencies = [],
      lockTimeout = this.lockTimeout,
      retryAttempts = this.retryAttempts,
      metadata = {}
    } = options;

    let executionId = null;
    let attempt = 0;

    while (attempt < retryAttempts) {
      try {
        attempt++;
        console.log(`🚀 Starting job execution: ${jobName} (attempt ${attempt}/${retryAttempts})`);

        // Wait for dependencies
        for (const dependency of dependencies) {
          const dependencyReady = await this.waitForDependency(dependency);
          if (!dependencyReady) {
            throw new Error(`Dependency ${dependency} not ready`);
          }
        }

        // Acquire lock
        executionId = await this.acquireLock(jobName, lockTimeout, { 
          ...metadata, 
          attempt,
          dependencies 
        });
        
        if (!executionId) {
          if (attempt < retryAttempts) {
            const delay = this.calculateRetryDelay(attempt);
            console.log(`⏳ Job ${jobName} is locked, retrying in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            throw new Error(`Failed to acquire lock after ${retryAttempts} attempts`);
          }
        }

        // Execute the job
        const result = await jobFunction();
        
        // Release lock with success status
        await this.releaseLock(jobName, executionId, 'completed');
        
        console.log(`✅ Job completed successfully: ${jobName}`);
        return result;

      } catch (error) {
        console.error(`❌ Job execution failed: ${jobName} (attempt ${attempt}):`, error);

        // Release lock with failure status
        if (executionId) {
          await this.releaseLock(jobName, executionId, 'failed', error.message);
          executionId = null;
        }

        // If this was the last attempt, throw the error
        if (attempt >= retryAttempts) {
          throw error;
        }

        // Calculate retry delay with exponential backoff
        const delay = this.calculateRetryDelay(attempt);
        console.log(`🔄 Retrying job ${jobName} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {number} - Delay in milliseconds
   */
  calculateRetryDelay(attempt) {
    // Exponential backoff: baseDelay * (2 ^ (attempt - 1)) + jitter
    const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 5 * 60 * 1000); // Cap at 5 minutes
  }

  /**
   * Clean up expired locks
   */
  async cleanupExpiredLocks() {
    try {
      const result = await db.query(`
        DELETE FROM system.cron_locks 
        WHERE expires_at < NOW()
        RETURNING job_name, execution_id
      `);

      if (result.rows.length > 0) {
        console.log(`🧹 Cleaned up ${result.rows.length} expired locks`);
        
        // Mark these executions as timed out
        for (const row of result.rows) {
          await db.query(`
            UPDATE system.cron_execution_log 
            SET status = 'timeout', completed_at = NOW()
            WHERE job_name = $1 AND execution_id = $2 AND status = 'started'
          `, [row.job_name, row.execution_id]);
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup expired locks:', error);
    }
  }

  /**
   * Get execution status for a job
   * @param {string} jobName - Name of the cron job
   * @param {number} limit - Number of recent executions to return
   * @returns {Promise<Array>} - Array of execution records
   */
  async getExecutionHistory(jobName, limit = 10) {
    try {
      const result = await db.query(`
        SELECT 
          execution_id,
          status,
          started_at,
          completed_at,
          duration_ms,
          error_message,
          metadata
        FROM system.cron_execution_log 
        WHERE job_name = $1 
        ORDER BY started_at DESC 
        LIMIT $2
      `, [jobName, limit]);

      return result.rows;
    } catch (error) {
      console.error(`❌ Failed to get execution history for ${jobName}:`, error);
      return [];
    }
  }

  /**
   * Get current system status
   * @returns {Promise<object>} - System status information
   */
  async getSystemStatus() {
    try {
      // Get active locks
      const locksResult = await db.query(`
        SELECT job_name, locked_by, locked_at, expires_at, metadata
        FROM system.cron_locks 
        WHERE expires_at > NOW()
        ORDER BY locked_at DESC
      `);

      // Get recent execution summary
      const executionsResult = await db.query(`
        SELECT 
          job_name,
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE status = 'completed') as successful,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status = 'timeout') as timeouts,
          MAX(started_at) as last_execution,
          AVG(duration_ms) FILTER (WHERE status = 'completed') as avg_duration_ms
        FROM system.cron_execution_log 
        WHERE started_at > NOW() - INTERVAL '24 hours'
        GROUP BY job_name
        ORDER BY last_execution DESC
      `);

      return {
        activeLocks: locksResult.rows,
        executionSummary: executionsResult.rows,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get system status:', error);
      return {
        activeLocks: [],
        executionSummary: [],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Force release a lock (emergency use only)
   * @param {string} jobName - Name of the cron job
   * @returns {Promise<boolean>} - True if lock was released
   */
  async forceReleaseLock(jobName) {
    try {
      const result = await db.query(`
        DELETE FROM system.cron_locks 
        WHERE job_name = $1
        RETURNING execution_id
      `, [jobName]);

      if (result.rows.length > 0) {
        const executionId = result.rows[0].execution_id;
        
        // Mark as force-released in log
        await db.query(`
          UPDATE system.cron_execution_log 
          SET status = 'force_released', completed_at = NOW(), error_message = 'Lock force-released'
          WHERE job_name = $1 AND execution_id = $2 AND status = 'started'
        `, [jobName, executionId]);

        console.log(`🔓 Force released lock for job: ${jobName}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ Failed to force release lock for ${jobName}:`, error);
      return false;
    }
  }

  /**
   * Get lock status for a specific job
   * @param {string} jobName - Name of the job
   * @returns {Promise<object>} - Lock status information
   */
  async getLockStatus(jobName) {
    try {
      const result = await db.query(`
        SELECT 
          job_name,
          locked_at,
          locked_by,
          expires_at,
          execution_id,
          metadata
        FROM system.cron_locks 
        WHERE job_name = $1
      `, [jobName]);

      if (result.rows.length === 0) {
        return {
          locked: false,
          jobName,
          message: 'No active lock found'
        };
      }

      const lock = result.rows[0];
      const now = new Date();
      const expiresAt = new Date(lock.expires_at);

      return {
        locked: true,
        jobName,
        lockedAt: lock.locked_at,
        lockedBy: lock.locked_by,
        expiresAt: lock.expires_at,
        executionId: lock.execution_id,
        metadata: lock.metadata,
        isExpired: now > expiresAt
      };
    } catch (error) {
      console.error(`❌ Failed to get lock status for ${jobName}:`, error);
      return {
        locked: false,
        jobName,
        error: error.message
      };
    }
  }

  /**
   * Log job execution to the database
   * @param {string} jobName - Name of the job
   * @param {string} status - Execution status ('started', 'completed', 'failed')
   * @param {number} durationMs - Execution duration in milliseconds
   * @param {string} errorMessage - Error message if failed
   * @param {object} metadata - Additional metadata
   * @param {string} executionId - Optional execution ID, will generate UUID if not provided
   */
  async logExecution(jobName, status, durationMs, errorMessage = null, metadata = {}, executionId = null) {
    try {
      // Generate UUID if not provided
      const uuid = executionId || require('crypto').randomUUID();
      
      await db.query(`
        INSERT INTO system.cron_execution_log (
          job_name, execution_id, status, duration_ms, error_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [jobName, uuid, status, durationMs, errorMessage, JSON.stringify(metadata)]);
    } catch (error) {
      console.error(`❌ Failed to log execution for ${jobName}:`, error);
    }
  }
}

// Export singleton instance
const cronCoordinator = new CronCoordinator();
module.exports = cronCoordinator;