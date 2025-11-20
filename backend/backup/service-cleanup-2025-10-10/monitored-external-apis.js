const LoggingMiddleware = require('../middleware/logging-middleware');
const healthMonitor = require('./health-monitor');

/**
 * Monitored External API Services
 * Wraps external API calls with comprehensive logging and monitoring
 */
class MonitoredExternalAPIs {
  /**
   * Wrap SportMonks service with monitoring
   */
  static wrapSportMonksService(SportMonksService) {
    const originalMethods = {};
    
    // Wrap key methods
    const methodsToWrap = [
      'fetchFixtures',
      'fetchFixtureOdds',
      'fetchLeagues',
      'fetchAndSaveFixtures',
      'processFixtures'
    ];

    methodsToWrap.forEach(methodName => {
      if (SportMonksService.prototype[methodName]) {
        originalMethods[methodName] = SportMonksService.prototype[methodName];
        SportMonksService.prototype[methodName] = LoggingMiddleware.externalApiLogger(
          `SportMonks.${methodName}`,
          originalMethods[methodName]
        );
      }
    });

    return SportMonksService;
  }

  /**
   * Wrap Coinpaprika service with monitoring
   */
  static wrapCoinpaprikaService(CoinpaprikaService) {
    const originalMethods = {};
    
    // Wrap key methods
    const methodsToWrap = [
      'fetchCryptoData',
      'fetchCoinDetails',
      'fetchMarketData',
      'processAndSaveCryptoData'
    ];

    methodsToWrap.forEach(methodName => {
      if (CoinpaprikaService.prototype[methodName]) {
        originalMethods[methodName] = CoinpaprikaService.prototype[methodName];
        CoinpaprikaService.prototype[methodName] = LoggingMiddleware.externalApiLogger(
          `Coinpaprika.${methodName}`,
          originalMethods[methodName]
        );
      }
    });

    return CoinpaprikaService;
  }

  /**
   * Wrap blockchain service with monitoring
   */
  static wrapBlockchainService(Web3Service) {
    const originalMethods = {};
    
    // Wrap key methods
    const methodsToWrap = [
      'getBlockNumber',
      'getTransaction',
      'sendTransaction',
      'callContract',
      'getContractEvents'
    ];

    methodsToWrap.forEach(methodName => {
      if (Web3Service.prototype[methodName]) {
        originalMethods[methodName] = Web3Service.prototype[methodName];
        Web3Service.prototype[methodName] = LoggingMiddleware.externalApiLogger(
          `Blockchain.${methodName}`,
          originalMethods[methodName]
        );
      }
    });

    return Web3Service;
  }

  /**
   * Wrap cron job functions with monitoring
   */
  static wrapCronJob(jobName, cronFunction) {
    return LoggingMiddleware.cronJobLogger(jobName, cronFunction);
  }

  /**
   * Create monitored axios instance for external APIs
   */
  static createMonitoredAxios(apiName) {
    const axios = require('axios');
    
    // Create axios instance with interceptors
    const monitoredAxios = axios.create();

    // Request interceptor
    monitoredAxios.interceptors.request.use(
      (config) => {
        config.metadata = {
          startTime: Date.now(),
          apiName,
          requestId: Math.random().toString(36).substring(2, 15)
        };

        healthMonitor.logInfo(`External API request: ${apiName}`, {
          requestId: config.metadata.requestId,
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL
        });

        return config;
      },
      (error) => {
        healthMonitor.logError(`External API request error: ${apiName}`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    monitoredAxios.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        healthMonitor.logInfo(`External API response: ${apiName}`, {
          requestId: response.config.metadata.requestId,
          status: response.status,
          duration: `${duration}ms`,
          dataSize: JSON.stringify(response.data).length
        });

        // Log slow responses
        if (duration > 5000) {
          healthMonitor.logWarning(`Slow external API response: ${apiName}`, {
            requestId: response.config.metadata.requestId,
            duration: `${duration}ms`,
            url: response.config.url
          });
        }

        healthMonitor.incrementApiCalls();
        return response;
      },
      (error) => {
        const duration = error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0;

        healthMonitor.logError(`External API error: ${apiName}`, error, {
          requestId: error.config?.metadata?.requestId,
          duration: `${duration}ms`,
          status: error.response?.status,
          url: error.config?.url
        });

        return Promise.reject(error);
      }
    );

    return monitoredAxios;
  }

  /**
   * Monitor service health periodically
   */
  static startServiceHealthMonitoring(intervalMs = 300000) { // 5 minutes
    setInterval(async () => {
      try {
        const health = await healthMonitor.getComprehensiveHealthStatus();
        
        // Log health status
        healthMonitor.logInfo('Periodic health check completed', {
          status: health.status,
          services: Object.keys(health.services).reduce((acc, key) => {
            acc[key] = health.services[key].status;
            return acc;
          }, {}),
          uptime: health.uptime
        });

        // Alert on unhealthy services
        Object.entries(health.services).forEach(([serviceName, serviceHealth]) => {
          if (serviceHealth.status === 'unhealthy') {
            healthMonitor.logError(`Service unhealthy: ${serviceName}`, 
              new Error(serviceHealth.lastError || 'Unknown error'), 
              { serviceName, serviceHealth }
            );
          }
        });

      } catch (error) {
        healthMonitor.logError('Periodic health check failed', error);
      }
    }, intervalMs);

    healthMonitor.logInfo('Service health monitoring started', {
      intervalMs,
      intervalMinutes: intervalMs / 60000
    });
  }

  /**
   * Monitor system resources
   */
  static startResourceMonitoring(intervalMs = 60000) { // 1 minute
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Log resource usage
      const resourceLog = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        type: 'RESOURCE_USAGE',
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024)
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        uptime: process.uptime(),
        service: 'resource-monitor'
      };

      if (process.env.LOG_LEVEL === 'debug') {
        console.log(JSON.stringify(resourceLog));
      }

      // Alert on high memory usage
      if (memUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
        healthMonitor.logWarning('High memory usage detected', {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          threshold: '1GB'
        });
      }

    }, intervalMs);

    healthMonitor.logInfo('Resource monitoring started', {
      intervalMs,
      intervalMinutes: intervalMs / 60000
    });
  }
}

module.exports = MonitoredExternalAPIs;