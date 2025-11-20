const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Dependency Graph Service
 * 
 * Manages service dependencies and provides:
 * - Dependency visualization
 * - Circular dependency detection
 * - Service startup order calculation
 * - Dependency impact analysis
 * - Service isolation testing
 */

class DependencyGraphService extends EventEmitter {
  constructor() {
    super();
    this.serviceRegistry = require('./service-registry');
    this.dependencyGraph = new Map();
    this.circularDependencies = [];
    this.startupOrder = [];
    this.isRunning = false;
    this.graphFile = path.join(__dirname, '../data/dependency-graph.json');
    
    // Initialize dependency graph
    this.initialize();
  }

  /**
   * Initialize dependency graph service
   */
  async initialize() {
    try {
      // Load existing graph if available
      if (fs.existsSync(this.graphFile)) {
        const data = JSON.parse(fs.readFileSync(this.graphFile, 'utf8'));
        this.dependencyGraph = new Map(data.dependencyGraph || []);
        this.circularDependencies = data.circularDependencies || [];
        this.startupOrder = data.startupOrder || [];
      }
      
      // Build initial graph
      await this.buildDependencyGraph();
      
      console.log(`✅ Dependency Graph Service initialized with ${this.dependencyGraph.size} nodes`);
    } catch (error) {
      console.error('❌ Failed to initialize dependency graph service:', error);
    }
  }

  /**
   * Build dependency graph from service registry
   */
  async buildDependencyGraph() {
    const services = this.serviceRegistry.getAllServices();
    this.dependencyGraph.clear();
    
    // Add all services as nodes
    for (const service of services) {
      this.dependencyGraph.set(service.name, {
        id: service.name,
        name: service.name,
        type: service.type,
        status: service.status,
        dependencies: this.serviceRegistry.getDependencies(service.name),
        dependents: this.serviceRegistry.getDependents(service.name),
        metadata: service
      });
    }
    
    // Detect circular dependencies
    this.detectCircularDependencies();
    
    // Calculate startup order
    this.calculateStartupOrder();
    
    // Save graph
    await this.saveGraph();
    
    // Emit graph updated event
    this.emit('graphUpdated', this.dependencyGraph);
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies() {
    this.circularDependencies = [];
    const visited = new Set();
    const recursionStack = new Set();
    
    const dfs = (serviceName, path = []) => {
      if (recursionStack.has(serviceName)) {
        // Found circular dependency
        const cycleStart = path.indexOf(serviceName);
        const cycle = path.slice(cycleStart).concat([serviceName]);
        this.circularDependencies.push({
          services: cycle,
          description: `Circular dependency: ${cycle.join(' -> ')}`
        });
        return;
      }
      
      if (visited.has(serviceName)) {
        return;
      }
      
      visited.add(serviceName);
      recursionStack.add(serviceName);
      
      const dependencies = this.serviceRegistry.getDependencies(serviceName);
      for (const dependency of dependencies) {
        dfs(dependency, [...path, serviceName]);
      }
      
      recursionStack.delete(serviceName);
    };
    
    for (const serviceName of this.dependencyGraph.keys()) {
      if (!visited.has(serviceName)) {
        dfs(serviceName);
      }
    }
  }

  /**
   * Calculate service startup order using topological sort
   */
  calculateStartupOrder() {
    this.startupOrder = [];
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (serviceName) => {
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving ${serviceName}`);
      }
      
      if (visited.has(serviceName)) {
        return;
      }
      
      visiting.add(serviceName);
      
      const dependencies = this.serviceRegistry.getDependencies(serviceName) || [];
      for (const dependency of dependencies) {
        visit(dependency);
      }
      
      visiting.delete(serviceName);
      visited.add(serviceName);
      this.startupOrder.push(serviceName);
    };
    
    for (const serviceName of this.dependencyGraph.keys()) {
      if (!visited.has(serviceName)) {
        visit(serviceName);
      }
    }
    
    // Reverse to get startup order (dependencies first)
    this.startupOrder.reverse();
  }

  /**
   * Get dependency graph
   */
  getDependencyGraph() {
    return {
      nodes: Array.from(this.dependencyGraph.values()),
      edges: this.generateEdges(),
      metadata: {
        totalServices: this.dependencyGraph.size,
        circularDependencies: this.circularDependencies.length,
        startupOrder: this.startupOrder,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate edges for visualization
   */
  generateEdges() {
    const edges = [];
    
    for (const [serviceName, node] of this.dependencyGraph) {
      for (const dependency of node.dependencies) {
        edges.push({
          source: serviceName,
          target: dependency,
          type: 'dependency',
          weight: 1
        });
      }
    }
    
    return edges;
  }

  /**
   * Get service dependencies
   */
  getServiceDependencies(serviceName) {
    const node = this.dependencyGraph.get(serviceName);
    return node ? node.dependencies : [];
  }

  /**
   * Get service dependents
   */
  getServiceDependents(serviceName) {
    const node = this.dependencyGraph.get(serviceName);
    return node ? node.dependents : [];
  }

  /**
   * Get all services that depend on a service (transitive)
   */
  getAllDependents(serviceName) {
    const allDependents = new Set();
    const visited = new Set();
    
    const collectDependents = (currentService) => {
      if (visited.has(currentService)) {
        return;
      }
      
      visited.add(currentService);
      const dependents = this.getServiceDependents(currentService);
      
      for (const dependent of dependents) {
        allDependents.add(dependent);
        collectDependents(dependent);
      }
    };
    
    collectDependents(serviceName);
    return Array.from(allDependents);
  }

  /**
   * Get all services that a service depends on (transitive)
   */
  getAllDependencies(serviceName) {
    const allDependencies = new Set();
    const visited = new Set();
    
    const collectDependencies = (currentService) => {
      if (visited.has(currentService)) {
        return;
      }
      
      visited.add(currentService);
      const dependencies = this.getServiceDependencies(currentService);
      
      for (const dependency of dependencies) {
        allDependencies.add(dependency);
        collectDependencies(dependency);
      }
    };
    
    collectDependencies(serviceName);
    return Array.from(allDependencies);
  }

  /**
   * Analyze dependency impact
   */
  analyzeDependencyImpact(serviceName) {
    const allDependents = this.getAllDependents(serviceName);
    const allDependencies = this.getAllDependencies(serviceName);
    
    return {
      service: serviceName,
      directDependents: this.getServiceDependents(serviceName).length,
      totalDependents: allDependents.length,
      directDependencies: this.getServiceDependencies(serviceName).length,
      totalDependencies: allDependencies.length,
      impactScore: allDependents.length + allDependencies.length,
      criticality: this.calculateCriticality(serviceName, allDependents),
      dependents: allDependents,
      dependencies: allDependencies
    };
  }

  /**
   * Calculate service criticality
   */
  calculateCriticality(serviceName, allDependents) {
    const totalServices = this.dependencyGraph.size;
    const dependentRatio = allDependents.length / totalServices;
    
    if (dependentRatio > 0.7) {
      return 'critical';
    } else if (dependentRatio > 0.4) {
      return 'high';
    } else if (dependentRatio > 0.2) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get services by criticality
   */
  getServicesByCriticality() {
    const criticalityMap = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    for (const serviceName of this.dependencyGraph.keys()) {
      const impact = this.analyzeDependencyImpact(serviceName);
      criticalityMap[impact.criticality].push({
        service: serviceName,
        impact: impact
      });
    }
    
    return criticalityMap;
  }

  /**
   * Test service isolation
   */
  testServiceIsolation(serviceName) {
    const dependents = this.getAllDependents(serviceName);
    const dependencies = this.getAllDependencies(serviceName);
    
    return {
      service: serviceName,
      canBeIsolated: dependents.length === 0,
      isolationImpact: {
        affectedServices: dependents,
        affectedCount: dependents.length,
        isolationComplexity: dependencies.length
      },
      recommendations: this.generateIsolationRecommendations(serviceName, dependents, dependencies)
    };
  }

  /**
   * Generate isolation recommendations
   */
  generateIsolationRecommendations(serviceName, dependents, dependencies) {
    const recommendations = [];
    
    if (dependents.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `Service ${serviceName} cannot be isolated as it has ${dependents.length} dependents`,
        action: 'Consider refactoring dependent services or implementing interfaces'
      });
    }
    
    if (dependencies.length > 0) {
      recommendations.push({
        type: 'info',
        message: `Service ${serviceName} has ${dependencies.length} dependencies`,
        action: 'Ensure all dependencies are available before isolation'
      });
    }
    
    if (dependents.length === 0 && dependencies.length === 0) {
      recommendations.push({
        type: 'success',
        message: `Service ${serviceName} can be safely isolated`,
        action: 'No special considerations needed'
      });
    }
    
    return recommendations;
  }

  /**
   * Get circular dependencies
   */
  getCircularDependencies() {
    return this.circularDependencies;
  }

  /**
   * Get startup order
   */
  getStartupOrder() {
    return this.startupOrder;
  }

  /**
   * Validate dependency graph
   */
  validateDependencyGraph() {
    const issues = [];
    
    // Check for circular dependencies
    if (this.circularDependencies.length > 0) {
      issues.push({
        type: 'circular_dependency',
        severity: 'high',
        message: `Found ${this.circularDependencies.length} circular dependencies`,
        details: this.circularDependencies
      });
    }
    
    // Check for missing dependencies
    for (const [serviceName, node] of this.dependencyGraph) {
      for (const dependency of node.dependencies) {
        if (!this.dependencyGraph.has(dependency)) {
          issues.push({
            type: 'missing_dependency',
            severity: 'medium',
            service: serviceName,
            dependency: dependency,
            message: `Service ${serviceName} depends on ${dependency} which is not in the graph`
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * Generate dependency report
   */
  generateDependencyReport() {
    const graph = this.getDependencyGraph();
    const criticality = this.getServicesByCriticality();
    const circularDeps = this.getCircularDependencies();
    const validation = this.validateDependencyGraph();
    
    return {
      summary: {
        totalServices: graph.metadata.totalServices,
        totalDependencies: graph.edges.length,
        circularDependencies: circularDeps.length,
        validationIssues: validation.length
      },
      criticality: criticality,
      circularDependencies: circularDeps,
      validation: validation,
      startupOrder: this.startupOrder,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Save dependency graph
   */
  async saveGraph() {
    try {
      const data = {
        dependencyGraph: Array.from(this.dependencyGraph.entries()),
        circularDependencies: this.circularDependencies,
        startupOrder: this.startupOrder,
        lastUpdated: new Date().toISOString()
      };
      
      // Ensure directory exists
      const dir = path.dirname(this.graphFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.graphFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save dependency graph:', error);
    }
  }

  /**
   * Start dependency graph service
   */
  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Dependency Graph Service started');
    
    // Listen to service registry events
    this.serviceRegistry.on('serviceRegistered', () => {
      this.buildDependencyGraph();
    });
    
    this.serviceRegistry.on('serviceUnregistered', () => {
      this.buildDependencyGraph();
    });
    
    this.serviceRegistry.on('dependencyAdded', () => {
      this.buildDependencyGraph();
    });
    
    this.serviceRegistry.on('dependencyRemoved', () => {
      this.buildDependencyGraph();
    });
    
    // Emit startup event
    this.emit('serviceStarted');
  }

  /**
   * Stop dependency graph service
   */
  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('🛑 Dependency Graph Service stopped');
    
    // Emit shutdown event
    this.emit('serviceStopped');
  }
}

// Export singleton instance
module.exports = new DependencyGraphService();
