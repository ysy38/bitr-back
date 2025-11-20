const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Service Registry
 * 
 * Centralized service discovery and management system:
 * - Service registration and discovery
 * - Service metadata management
 * - Service lifecycle tracking
 * - Service dependency management
 * - Service health status tracking
 */

class ServiceRegistry extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.dependencies = new Map();
    this.healthStatus = new Map();
    this.isRunning = false;
    this.registryFile = path.join(__dirname, '../data/service-registry.json');
    
    // Initialize registry
    this.initialize();
  }

  /**
   * Initialize service registry
   */
  async initialize() {
    try {
      // Load existing registry if available
      if (fs.existsSync(this.registryFile)) {
        const data = JSON.parse(fs.readFileSync(this.registryFile, 'utf8'));
        this.services = new Map(data.services || []);
        this.dependencies = new Map(data.dependencies || []);
        this.healthStatus = new Map(data.healthStatus || []);
      }
      
      // Auto-discover services
      await this.autoDiscoverServices();
      
      console.log(`✅ Service Registry initialized with ${this.services.size} services`);
    } catch (error) {
      console.error('❌ Failed to initialize service registry:', error);
    }
  }

  /**
   * Auto-discover services from the services directory
   */
  async autoDiscoverServices() {
    const servicesDir = path.join(__dirname);
    const serviceFiles = fs.readdirSync(servicesDir)
      .filter(file => file.endsWith('.js') && file !== 'service-registry.js')
      .map(file => path.basename(file, '.js'));

    for (const serviceName of serviceFiles) {
      if (!this.services.has(serviceName)) {
        await this.registerService(serviceName, {
          name: serviceName,
          type: 'discovered',
          status: 'unknown',
          discoveredAt: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Register a service
   */
  async registerService(serviceName, metadata = {}) {
    const serviceInfo = {
      name: serviceName,
      type: metadata.type || 'custom',
      status: metadata.status || 'registered',
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      endpoints: metadata.endpoints || [],
      dependencies: metadata.dependencies || [],
      healthCheck: metadata.healthCheck || null,
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...metadata
    };

    this.services.set(serviceName, serviceInfo);
    this.healthStatus.set(serviceName, {
      status: 'unknown',
      lastCheck: null,
      consecutiveFailures: 0,
      uptime: 0,
      responseTime: null
    });

    // Emit registration event
    this.emit('serviceRegistered', serviceName, serviceInfo);
    
    // Save registry
    await this.saveRegistry();
    
    console.log(`📝 Service registered: ${serviceName}`);
    return serviceInfo;
  }

  /**
   * Unregister a service
   */
  async unregisterService(serviceName) {
    if (this.services.has(serviceName)) {
      this.services.delete(serviceName);
      this.healthStatus.delete(serviceName);
      
      // Remove from dependencies
      for (const [dependent, deps] of this.dependencies) {
        const updatedDeps = deps.filter(dep => dep !== serviceName);
        if (updatedDeps.length === 0) {
          this.dependencies.delete(dependent);
        } else {
          this.dependencies.set(dependent, updatedDeps);
        }
      }
      
      // Emit unregistration event
      this.emit('serviceUnregistered', serviceName);
      
      // Save registry
      await this.saveRegistry();
      
      console.log(`🗑️ Service unregistered: ${serviceName}`);
      return true;
    }
    return false;
  }

  /**
   * Get service information
   */
  getService(serviceName) {
    return this.services.get(serviceName);
  }

  /**
   * Get all services
   */
  getAllServices() {
    return Array.from(this.services.values());
  }

  /**
   * Get services by type
   */
  getServicesByType(type) {
    return Array.from(this.services.values()).filter(service => service.type === type);
  }

  /**
   * Get services by status
   */
  getServicesByStatus(status) {
    return Array.from(this.services.values()).filter(service => service.status === status);
  }

  /**
   * Update service metadata
   */
  async updateService(serviceName, updates) {
    const service = this.services.get(serviceName);
    if (service) {
      const updatedService = {
        ...service,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      this.services.set(serviceName, updatedService);
      
      // Emit update event
      this.emit('serviceUpdated', serviceName, updatedService);
      
      // Save registry
      await this.saveRegistry();
      
      return updatedService;
    }
    return null;
  }

  /**
   * Add service dependency
   */
  async addDependency(serviceName, dependency) {
    if (!this.dependencies.has(serviceName)) {
      this.dependencies.set(serviceName, []);
    }
    
    const deps = this.dependencies.get(serviceName);
    if (!deps.includes(dependency)) {
      deps.push(dependency);
      this.dependencies.set(serviceName, deps);
      
      // Emit dependency event
      this.emit('dependencyAdded', serviceName, dependency);
      
      // Save registry
      await this.saveRegistry();
    }
  }

  /**
   * Remove service dependency
   */
  async removeDependency(serviceName, dependency) {
    if (this.dependencies.has(serviceName)) {
      const deps = this.dependencies.get(serviceName);
      const updatedDeps = deps.filter(dep => dep !== dependency);
      
      if (updatedDeps.length === 0) {
        this.dependencies.delete(serviceName);
      } else {
        this.dependencies.set(serviceName, updatedDeps);
      }
      
      // Emit dependency event
      this.emit('dependencyRemoved', serviceName, dependency);
      
      // Save registry
      await this.saveRegistry();
    }
  }

  /**
   * Get service dependencies
   */
  getDependencies(serviceName) {
    return this.dependencies.get(serviceName) || [];
  }

  /**
   * Get services that depend on a service
   */
  getDependents(serviceName) {
    const dependents = [];
    for (const [dependent, deps] of this.dependencies) {
      if (deps.includes(serviceName)) {
        dependents.push(dependent);
      }
    }
    return dependents;
  }

  /**
   * Update service health status
   */
  async updateHealthStatus(serviceName, status, responseTime = null) {
    const healthInfo = this.healthStatus.get(serviceName);
    if (healthInfo) {
      const previousStatus = healthInfo.status;
      healthInfo.status = status;
      healthInfo.lastCheck = new Date().toISOString();
      healthInfo.responseTime = responseTime;
      
      if (status === 'healthy') {
        healthInfo.consecutiveFailures = 0;
        healthInfo.uptime = Date.now();
      } else if (status === 'unhealthy') {
        healthInfo.consecutiveFailures++;
      }
      
      this.healthStatus.set(serviceName, healthInfo);
      
      // Emit health change event
      if (previousStatus !== status) {
        this.emit('healthStatusChanged', serviceName, status, healthInfo);
      }
      
      // Save registry
      await this.saveRegistry();
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus(serviceName) {
    return this.healthStatus.get(serviceName);
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses() {
    return Array.from(this.healthStatus.entries()).map(([name, status]) => ({
      serviceName: name,
      ...status
    }));
  }

  /**
   * Get services with health issues
   */
  getUnhealthyServices() {
    return Array.from(this.healthStatus.entries())
      .filter(([name, status]) => status.status === 'unhealthy')
      .map(([name, status]) => ({ serviceName: name, ...status }));
  }

  /**
   * Get service statistics
   */
  getServiceStatistics() {
    const services = Array.from(this.services.values());
    const healthStatuses = Array.from(this.healthStatus.values());
    
    return {
      totalServices: services.length,
      servicesByType: services.reduce((acc, service) => {
        acc[service.type] = (acc[service.type] || 0) + 1;
        return acc;
      }, {}),
      servicesByStatus: services.reduce((acc, service) => {
        acc[service.status] = (acc[service.status] || 0) + 1;
        return acc;
      }, {}),
      healthStatistics: {
        healthy: healthStatuses.filter(h => h.status === 'healthy').length,
        unhealthy: healthStatuses.filter(h => h.status === 'unhealthy').length,
        unknown: healthStatuses.filter(h => h.status === 'unknown').length
      },
      totalDependencies: Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.length, 0)
    };
  }

  /**
   * Generate dependency graph
   */
  generateDependencyGraph() {
    const graph = {
      nodes: [],
      edges: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        totalServices: this.services.size,
        totalDependencies: Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.length, 0)
      }
    };

    // Add nodes (services)
    for (const [serviceName, serviceInfo] of this.services) {
      const healthStatus = this.healthStatus.get(serviceName);
      graph.nodes.push({
        id: serviceName,
        name: serviceName,
        type: serviceInfo.type,
        status: serviceInfo.status,
        health: healthStatus?.status || 'unknown',
        dependencies: this.dependencies.get(serviceName) || [],
        metadata: serviceInfo
      });
    }

    // Add edges (dependencies)
    for (const [serviceName, dependencies] of this.dependencies) {
      for (const dependency of dependencies) {
        graph.edges.push({
          source: serviceName,
          target: dependency,
          type: 'dependency'
        });
      }
    }

    return graph;
  }

  /**
   * Validate service dependencies
   */
  validateDependencies() {
    const issues = [];
    
    for (const [serviceName, dependencies] of this.dependencies) {
      for (const dependency of dependencies) {
        if (!this.services.has(dependency)) {
          issues.push({
            type: 'missing_dependency',
            service: serviceName,
            dependency: dependency,
            message: `Service ${serviceName} depends on ${dependency} which is not registered`
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * Get service startup order
   */
  getStartupOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];
    
    const visit = (serviceName) => {
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving ${serviceName}`);
      }
      
      if (visited.has(serviceName)) {
        return;
      }
      
      visiting.add(serviceName);
      
      const dependencies = this.dependencies.get(serviceName) || [];
      for (const dependency of dependencies) {
        visit(dependency);
      }
      
      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };
    
    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }
    
    return order;
  }

  /**
   * Save registry to file
   */
  async saveRegistry() {
    try {
      const data = {
        services: Array.from(this.services.entries()),
        dependencies: Array.from(this.dependencies.entries()),
        healthStatus: Array.from(this.healthStatus.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      // Ensure directory exists
      const dir = path.dirname(this.registryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.registryFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save service registry:', error);
    }
  }

  /**
   * Start service registry
   */
  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Service Registry started');
    
    // Emit startup event
    this.emit('registryStarted');
  }

  /**
   * Stop service registry
   */
  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('🛑 Service Registry stopped');
    
    // Emit shutdown event
    this.emit('registryStopped');
  }
}

// Export singleton instance
module.exports = new ServiceRegistry();
