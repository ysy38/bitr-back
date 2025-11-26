const healthMonitor = require('../services/system-monitor');
const loggingConfig = require('../config/logging');

/**
 * Health Monitoring Middleware
 * Implements Requirements 6.2, 6.4: Structured logging and API request/response monitoring
 */
class HealthMonitoringMiddleware {
  /**
   * Request tracking middleware with enhanced monitoring
   */
  static requestTracker(req, res, next) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    // Add request ID and start time to request
    req.requestId = requestId;
    req.startTime = startTime;

    // Track request metrics
    healthMonitor.incrementRequests();

    // Enhanced request logging
    const requestContext = {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      referer: req.get('Referer')
    };

    // Log request start
    loggingConfig.info(`API Request: ${req.method} ${req.path}`, {
      service: 'api',
      type: 'request_start',
      ...requestContext
    });

    // Monitor response
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      
      const responseContext = {
        ...requestContext,
        statusCode: res.statusCode,
        duration,
        responseSize: res.get('Content-Length') || 'unknown'
      };

      // Log response completion
      await loggingConfig.logApiRequest(req, res, duration);

      // Track performance metrics
      if (res.statusCode >= 400) {
        healthMonitor.metrics.errors++;
      }

      // Alert on slow requests
      if (duration > 2000) {
        await loggingConfig.warn(`Slow API request detected`, {
          service: 'api',
          type: 'performance_alert',
          ...responseContext
        });
      }

      // Alert on error responses
      if (res.statusCode >= 500) {
        await loggingConfig.error(`Server error response`, null, {
          service: 'api',
          type: 'error_response',
          ...responseContext
        });
      }
    });

    next();
  }

  /**
   * Database operation monitoring wrapper
   */
  static databaseOperationMonitor(operation, context = {}) {
    return async function(...args) {
      const startTime = Date.now();
      const operationId = Math.random().toString(36).substring(2, 15);

      try {
        // Log operation start
        await loggingConfig.debug(`Database operation started: ${operation}`, {
          service: 'database',
          type: 'operation_start',
          operationId,
          operation,
          ...context
        });

        const result = await this.apply(this, args);
        const duration = Date.now() - startTime;

        // Log successful operation
        await loggingConfig.logDatabaseQuery(operation, args, duration);

        // Track metrics
        healthMonitor.metrics.dbQueries++;

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;

        // Log failed operation
        await loggingConfig.logDatabaseQuery(operation, args, duration, error);

        // Track error metrics
        healthMonitor.metrics.dbErrors++;

        throw error;
      }
    };
  }

  /**
   * External API call monitoring wrapper
   */
  static externalApiMonitor(apiName, endpoint) {
    return async function(apiFunction, ...args) {
      const startTime = Date.now();
      const callId = Math.random().toString(36).substring(2, 15);

      try {
        // Log API call start
        await loggingConfig.debug(`External API call started: ${apiName}`, {
          service: 'external-api',
          type: 'api_call_start',
          callId,
          apiName,
          endpoint
        });

        const result = await apiFunction.apply(this, args);
        const duration = Date.now() - startTime;

        // Log successful API call
        await loggingConfig.logExternalApiCall(apiName, endpoint, 'success', duration);

        // Track metrics
        healthMonitor.incrementApiCalls();

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;

        // Log failed API call
        await loggingConfig.logExternalApiCall(apiName, endpoint, 'error', duration, error);

        throw error;
      }
    };
  }

  /**
   * Cron job execution monitoring wrapper
   */
  static cronJobMonitor(jobName) {
    return function(jobFunction) {
      return async function(...args) {
        const startTime = Date.now();
        const jobId = Math.random().toString(36).substring(2, 15);

        try {
          // Log job start
          await loggingConfig.info(`Cron job started: ${jobName}`, {
            service: 'cron',
            type: 'job_start',
            jobId,
            jobName,
            startTime: new Date().toISOString()
          });

          const result = await jobFunction.apply(this, args);
          const duration = Date.now() - startTime;

          // Log job completion
          await loggingConfig.logCronJob(jobName, 'success', duration);

          // Track metrics
          healthMonitor.incrementCronJobs();

          return result;

        } catch (error) {
          const duration = Date.now() - startTime;

          // Log job failure
          await loggingConfig.logCronJob(jobName, 'failed', duration, error);

          // Track failure metrics
          healthMonitor.incrementCronFailures();

          throw error;
        }
      };
    };
  }

  /**
   * Memory usage monitoring middleware
   */
  static memoryMonitor(req, res, next) {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const utilization = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    // Alert on high memory usage
    if (utilization > 85) {
      loggingConfig.warn(`High memory usage detected: ${utilization}%`, {
        service: 'system',
        type: 'memory_alert',
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        utilization: `${utilization}%`,
        path: req.path,
        method: req.method
      });
    }

    // Add memory info to request for debugging
    req.memoryUsage = {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      utilization
    };

    next();
  }

  /**
   * Error handling middleware with enhanced logging
   */
  static errorHandler(error, req, res, next) {
    const errorContext = {
      service: 'api',
      type: 'unhandled_error',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: error.status || 500,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    };

    // Log the error with full context
    loggingConfig.error('Unhandled API error', error, errorContext);

    // Track error metrics
    healthMonitor.metrics.errors++;

    // Send error response
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        message: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        requestId: req.requestId
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Health check middleware for individual services
   */
  static serviceHealthCheck(serviceName, healthCheckFunction) {
    return async (req, res, next) => {
      try {
        const startTime = Date.now();
        const isHealthy = await healthCheckFunction();
        const duration = Date.now() - startTime;

        if (isHealthy) {
          await loggingConfig.debug(`Service health check passed: ${serviceName}`, {
            service: serviceName,
            type: 'health_check',
            status: 'healthy',
            duration
          });
        } else {
          await loggingConfig.warn(`Service health check failed: ${serviceName}`, {
            service: serviceName,
            type: 'health_check',
            status: 'unhealthy',
            duration
          });
        }

        req.serviceHealth = {
          [serviceName]: {
            status: isHealthy ? 'healthy' : 'unhealthy',
            checkDuration: duration
          }
        };

        next();

      } catch (error) {
        await loggingConfig.error(`Service health check error: ${serviceName}`, error, {
          service: serviceName,
          type: 'health_check_error'
        });

        req.serviceHealth = {
          [serviceName]: {
            status: 'error',
            error: error.message
          }
        };

        next();
      }
    };
  }

  /**
   * Rate limiting monitoring
   */
  static rateLimitMonitor(req, res, next) {
    // Track rate limiting metrics
    const rateLimitRemaining = res.get('X-RateLimit-Remaining');
    const rateLimitLimit = res.get('X-RateLimit-Limit');

    if (rateLimitRemaining && rateLimitLimit) {
      const utilizationPercent = Math.round(
        ((rateLimitLimit - rateLimitRemaining) / rateLimitLimit) * 100
      );

      // Alert on high rate limit utilization
      if (utilizationPercent > 80) {
        loggingConfig.warn(`High rate limit utilization: ${utilizationPercent}%`, {
          service: 'rate-limiter',
          type: 'rate_limit_alert',
          ip: req.ip,
          remaining: rateLimitRemaining,
          limit: rateLimitLimit,
          utilization: `${utilizationPercent}%`
        });
      }
    }

    next();
  }

  /**
   * Request size monitoring
   */
  static requestSizeMonitor(req, res, next) {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const sizeMB = Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100;
      
      // Alert on large requests
      if (sizeMB > 10) {
        loggingConfig.warn(`Large request detected: ${sizeMB}MB`, {
          service: 'api',
          type: 'large_request_alert',
          path: req.path,
          method: req.method,
          size: `${sizeMB}MB`,
          contentType: req.get('Content-Type')
        });
      }

      req.requestSize = sizeMB;
    }

    next();
  }
}

module.exports = HealthMonitoringMiddleware;