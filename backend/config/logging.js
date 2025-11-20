const config = require('../config');
const healthMonitor = require('../services/system-monitor');

/**
 * Enhanced Logging Configuration
 * Implements Requirement 6.2: Structured logging with context information
 */
class LoggingConfig {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';
    this.logFilePath = process.env.LOG_FILE || './logs/app.log';
    this.enableStructuredLogging = process.env.ENABLE_STRUCTURED_LOGGING !== 'false';
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, message, context = {}, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      context: {
        ...context,
        nodeEnv: process.env.NODE_ENV,
        service: context.service || 'bitredict-backend',
        version: process.env.npm_package_version || '1.0.0'
      }
    };

    // Add error details if provided
    if (error) {
      logEntry.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      };
    }

    // Add system metrics for error logs
    if (level === 'error') {
      const memUsage = process.memoryUsage();
      logEntry.system = {
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
        },
        uptime: Math.round(process.uptime())
      };
    }

    return logEntry;
  }

  /**
   * Enhanced console logging with colors and formatting
   */
  logToConsole(logEntry) {
    const colors = {
      ERROR: '\x1b[31m',   // Red
      WARN: '\x1b[33m',    // Yellow
      INFO: '\x1b[36m',    // Cyan
      DEBUG: '\x1b[37m',   // White
      RESET: '\x1b[0m'     // Reset
    };

    const color = colors[logEntry.level] || colors.INFO;
    const timestamp = logEntry.timestamp.substring(11, 19); // HH:MM:SS

    if (this.enableStructuredLogging) {
      // Structured JSON logging
      console.log(JSON.stringify(logEntry));
    } else {
      // Human-readable logging
      const contextStr = Object.keys(logEntry.context).length > 0 ? 
        ` [${JSON.stringify(logEntry.context)}]` : '';
      
      console.log(
        `${color}[${timestamp}] ${logEntry.level}${colors.RESET}: ${logEntry.message}${contextStr}`
      );

      if (logEntry.error) {
        console.error(`${colors.ERROR}Error: ${logEntry.error.message}${colors.RESET}`);
        if (logEntry.level === 'ERROR' && logEntry.error.stack) {
          console.error(logEntry.error.stack);
        }
      }
    }
  }

  /**
   * Log to file if enabled
   */
  async logToFile(logEntry) {
    if (!this.enableFileLogging) return;

    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      // Ensure log directory exists
      const logDir = path.dirname(this.logFilePath);
      await fs.mkdir(logDir, { recursive: true });

      // Append log entry to file
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.logFilePath, logLine);

    } catch (error) {
      // Fallback to console if file logging fails
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Main logging method
   */
  async log(level, message, context = {}, error = null) {
    // Check if log level should be output
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    if (levels[level] > levels[this.logLevel]) {
      return;
    }

    const logEntry = this.createLogEntry(level, message, context, error);

    // Output to console
    this.logToConsole(logEntry);

    // Output to file if enabled
    await this.logToFile(logEntry);

    // Track metrics in health monitor
    if (level === 'error') {
      healthMonitor.metrics.errors++;
    }
  }

  /**
   * Convenience methods
   */
  async info(message, context = {}) {
    await this.log('info', message, context);
  }

  async warn(message, context = {}) {
    await this.log('warn', message, context);
  }

  async error(message, error = null, context = {}) {
    await this.log('error', message, context, error);
  }

  async debug(message, context = {}) {
    await this.log('debug', message, context);
  }

  /**
   * API request logging
   */
  async logApiRequest(req, res, duration) {
    const context = {
      service: 'api',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    };

    const level = res.statusCode >= 400 ? 'error' : 'info';
    const message = `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`;

    await this.log(level, message, context);
  }

  /**
   * Database query logging
   */
  async logDatabaseQuery(query, params, duration, error = null) {
    const context = {
      service: 'database',
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      paramCount: params ? params.length : 0,
      duration: `${duration}ms`
    };

    if (error) {
      await this.log('error', 'Database query failed', context, error);
    } else if (duration > 1000) {
      await this.log('warn', 'Slow database query', context);
    } else if (this.logLevel === 'debug') {
      await this.log('debug', 'Database query executed', context);
    }
  }

  /**
   * Cron job logging
   */
  async logCronJob(jobName, status, duration, error = null) {
    const context = {
      service: 'cron',
      jobName,
      status,
      duration: `${duration}ms`
    };

    if (error) {
      await this.log('error', `Cron job failed: ${jobName}`, context, error);
    } else {
      await this.log('info', `Cron job completed: ${jobName}`, context);
    }
  }

  /**
   * External API call logging
   */
  async logExternalApiCall(apiName, endpoint, status, duration, error = null) {
    const context = {
      service: 'external-api',
      apiName,
      endpoint,
      status,
      duration: `${duration}ms`
    };

    if (error) {
      await this.log('error', `External API call failed: ${apiName}`, context, error);
    } else if (duration > 5000) {
      await this.log('warn', `Slow external API call: ${apiName}`, context);
    } else if (this.logLevel === 'debug') {
      await this.log('debug', `External API call: ${apiName}`, context);
    }
  }
}

// Export singleton
const loggingConfig = new LoggingConfig();

module.exports = loggingConfig;