const express = require('express');
const router = express.Router();
const serviceRegistry = require('../services/service-registry');
const dependencyGraph = require('../services/dependency-graph-service');
const EnhancedHealthMonitoring = require('../services/enhanced-health-monitoring');
const enhancedHealthMonitoring = new EnhancedHealthMonitoring();

// Initialize and start health monitoring (DISABLED - causing alert loops)
// enhancedHealthMonitoring.initialize().then(() => {
//   return enhancedHealthMonitoring.start();
// }).catch(error => {
//   console.error('Failed to initialize health monitoring:', error);
// });
console.log('⚠️ Enhanced health monitoring disabled to prevent alert loops');

/**
 * Service Registry API
 * 
 * Provides endpoints for service registry, dependency management, and health monitoring:
 * - Service registration and discovery
 * - Dependency graph visualization
 * - Health monitoring and alerts
 * - Service lifecycle management
 */

/**
 * GET /api/service-registry/services
 * Get all registered services
 */
router.get('/services', async (req, res) => {
  try {
    const { type, status } = req.query;
    
    let services = serviceRegistry.getAllServices();
    
    if (type) {
      services = services.filter(service => service.type === type);
    }
    
    if (status) {
      services = services.filter(service => service.status === status);
    }
    
    res.json({
      success: true,
      data: {
        services,
        total: services.length,
        filters: { type, status }
      }
    });
  } catch (error) {
    console.error('Error getting services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get services'
    });
  }
});

/**
 * GET /api/service-registry/services/:name
 * Get specific service information
 */
router.get('/services/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const service = serviceRegistry.getService(name);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }
    
    const dependencies = serviceRegistry.getDependencies(name);
    const dependents = serviceRegistry.getDependents(name);
    const healthStatus = serviceRegistry.getHealthStatus(name);
    
    res.json({
      success: true,
      data: {
        service,
        dependencies,
        dependents,
        healthStatus
      }
    });
  } catch (error) {
    console.error('Error getting service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service'
    });
  }
});

/**
 * POST /api/service-registry/services
 * Register a new service
 */
router.post('/services', async (req, res) => {
  try {
    const { name, metadata } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required'
      });
    }
    
    const service = await serviceRegistry.registerService(name, metadata);
    
    res.status(201).json({
      success: true,
      data: {
        service
      }
    });
  } catch (error) {
    console.error('Error registering service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register service'
    });
  }
});

/**
 * PUT /api/service-registry/services/:name
 * Update service metadata
 */
router.put('/services/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const updates = req.body;
    
    const service = await serviceRegistry.updateService(name, updates);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        service
      }
    });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update service'
    });
  }
});

/**
 * DELETE /api/service-registry/services/:name
 * Unregister a service
 */
router.delete('/services/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const success = await serviceRegistry.unregisterService(name);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        message: `Service ${name} unregistered successfully`
      }
    });
  } catch (error) {
    console.error('Error unregistering service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unregister service'
    });
  }
});

/**
 * POST /api/service-registry/services/:name/dependencies
 * Add service dependency
 */
router.post('/services/:name/dependencies', async (req, res) => {
  try {
    const { name } = req.params;
    const { dependency } = req.body;
    
    if (!dependency) {
      return res.status(400).json({
        success: false,
        error: 'Dependency is required'
      });
    }
    
    await serviceRegistry.addDependency(name, dependency);
    
    res.json({
      success: true,
      data: {
        message: `Dependency ${dependency} added to service ${name}`
      }
    });
  } catch (error) {
    console.error('Error adding dependency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add dependency'
    });
  }
});

/**
 * DELETE /api/service-registry/services/:name/dependencies/:dependency
 * Remove service dependency
 */
router.delete('/services/:name/dependencies/:dependency', async (req, res) => {
  try {
    const { name, dependency } = req.params;
    
    await serviceRegistry.removeDependency(name, dependency);
    
    res.json({
      success: true,
      data: {
        message: `Dependency ${dependency} removed from service ${name}`
      }
    });
  } catch (error) {
    console.error('Error removing dependency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove dependency'
    });
  }
});

/**
 * GET /api/service-registry/dependency-graph
 * Get dependency graph
 */
router.get('/dependency-graph', async (req, res) => {
  try {
    const graph = dependencyGraph.getDependencyGraph();
    
    res.json({
      success: true,
      data: {
        graph
      }
    });
  } catch (error) {
    console.error('Error getting dependency graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dependency graph'
    });
  }
});

/**
 * GET /api/service-registry/dependency-graph/analysis
 * Get dependency analysis
 */
router.get('/dependency-graph/analysis', async (req, res) => {
  try {
    const { service } = req.query;
    
    let analysis;
    if (service) {
      analysis = dependencyGraph.analyzeDependencyImpact(service);
    } else {
      analysis = dependencyGraph.generateDependencyReport();
    }
    
    res.json({
      success: true,
      data: {
        analysis
      }
    });
  } catch (error) {
    console.error('Error getting dependency analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dependency analysis'
    });
  }
});

/**
 * GET /api/service-registry/startup-order
 * Get service startup order
 */
router.get('/startup-order', async (req, res) => {
  try {
    const startupOrder = dependencyGraph.getStartupOrder();
    
    res.json({
      success: true,
      data: {
        startupOrder
      }
    });
  } catch (error) {
    console.error('Error getting startup order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get startup order'
    });
  }
});

/**
 * GET /api/service-registry/health
 * Get health monitoring status
 */
router.get('/health', async (req, res) => {
  try {
    const { service } = req.query;
    
    let healthData;
    if (service) {
      healthData = enhancedHealthMonitoring.getServiceHealthStatus(service);
    } else {
      healthData = enhancedHealthMonitoring.getSystemHealthOverview();
    }
    
    res.json({
      success: true,
      data: {
        health: healthData
      }
    });
  } catch (error) {
    console.error('Error getting health status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get health status'
    });
  }
});

/**
 * GET /api/service-registry/health/services
 * Get all service health statuses
 */
router.get('/health/services', async (req, res) => {
  try {
    const healthStatuses = enhancedHealthMonitoring.getAllHealthStatuses();
    
    res.json({
      success: true,
      data: {
        healthStatuses
      }
    });
  } catch (error) {
    console.error('Error getting health statuses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get health statuses'
    });
  }
});

/**
 * GET /api/service-registry/health/unhealthy
 * Get unhealthy services
 */
router.get('/health/unhealthy', async (req, res) => {
  try {
    const unhealthyServices = enhancedHealthMonitoring.getUnhealthyServices();
    
    res.json({
      success: true,
      data: {
        unhealthyServices
      }
    });
  } catch (error) {
    console.error('Error getting unhealthy services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unhealthy services'
    });
  }
});

/**
 * GET /api/service-registry/health/critical
 * Get critical services status
 */
router.get('/health/critical', async (req, res) => {
  try {
    const criticalServices = enhancedHealthMonitoring.getCriticalServicesStatus();
    
    res.json({
      success: true,
      data: {
        criticalServices
      }
    });
  } catch (error) {
    console.error('Error getting critical services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get critical services'
    });
  }
});

/**
 * GET /api/service-registry/health/trends/:service
 * Get health trends for a service
 */
router.get('/health/trends/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const { hours = 24 } = req.query;
    
    const trends = enhancedHealthMonitoring.getHealthTrends(service, parseInt(hours));
    
    res.json({
      success: true,
      data: {
        trends
      }
    });
  } catch (error) {
    console.error('Error getting health trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get health trends'
    });
  }
});

/**
 * GET /api/service-registry/alerts
 * Get alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const alerts = enhancedHealthMonitoring.getAlerts(parseInt(limit));
    
    res.json({
      success: true,
      data: {
        alerts
      }
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts'
    });
  }
});

/**
 * DELETE /api/service-registry/alerts
 * Clear alerts
 */
router.delete('/alerts', async (req, res) => {
  try {
    enhancedHealthMonitoring.clearAlerts();
    
    res.json({
      success: true,
      data: {
        message: 'Alerts cleared successfully'
      }
    });
  } catch (error) {
    console.error('Error clearing alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear alerts'
    });
  }
});

/**
 * POST /api/service-registry/health/check/:service
 * Perform health check for a service
 */
router.post('/health/check/:service', async (req, res) => {
  try {
    const { service } = req.params;
    
    const result = await enhancedHealthMonitoring.performHealthCheck(service);
    
    res.json({
      success: true,
      data: {
        result
      }
    });
  } catch (error) {
    console.error('Error performing health check:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform health check'
    });
  }
});

/**
 * POST /api/service-registry/health/check-all
 * Perform health check for all services
 */
router.post('/health/check-all', async (req, res) => {
  try {
    await enhancedHealthMonitoring.performAllHealthChecks();
    
    res.json({
      success: true,
      data: {
        message: 'Health checks completed for all services'
      }
    });
  } catch (error) {
    console.error('Error performing health checks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform health checks'
    });
  }
});

/**
 * GET /api/service-registry/statistics
 * Get service registry statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const statistics = serviceRegistry.getServiceStatistics();
    
    res.json({
      success: true,
      data: {
        statistics
      }
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

/**
 * GET /api/service-registry/validation
 * Validate service registry
 */
router.get('/validation', async (req, res) => {
  try {
    const issues = dependencyGraph.validateDependencyGraph();
    
    res.json({
      success: true,
      data: {
        issues,
        valid: issues.length === 0
      }
    });
  } catch (error) {
    console.error('Error validating service registry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate service registry'
    });
  }
});

module.exports = router;
