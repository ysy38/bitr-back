#!/usr/bin/env node

/**
 * Service Registry Initialization Script
 * 
 * Initializes the service registry with all existing services:
 * - Discovers all services in the services directory
 * - Registers them with metadata
 * - Sets up dependencies
 * - Starts health monitoring
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

class ServiceRegistryInitializer {
  constructor() {
    this.serviceRegistry = require('../services/service-registry');
    this.dependencyGraph = require('../services/dependency-graph-service');
    this.enhancedHealthMonitoring = require('../services/enhanced-health-monitoring');
  }

  async run() {
    console.log('🚀 Initializing Service Registry...');
    
    try {
      // Start services
      await this.serviceRegistry.start();
      await this.dependencyGraph.start();
      await this.enhancedHealthMonitoring.start();
      
      // Register existing services
      await this.registerExistingServices();
      
      // Set up dependencies
      await this.setupDependencies();
      
      // Perform initial health checks
      await this.performInitialHealthChecks();
      
      // Generate reports
      await this.generateReports();
      
      console.log('✅ Service Registry initialization completed');
      
    } catch (error) {
      console.error('❌ Service Registry initialization failed:', error);
      process.exit(1);
    }
  }

  /**
   * Register existing services
   */
  async registerExistingServices() {
    console.log('📝 Registering existing services...');
    
    const servicesToRegister = [
      {
        name: 'event-driven-pool-sync',
        type: 'sync',
        description: 'Event-driven pool synchronization service - CRITICAL for pool data sync',
        critical: true,
        endpoints: ['/api/pools/sync']
      },
      {
        name: 'event-driven-bet-sync',
        type: 'sync',
        description: 'Event-driven bet synchronization service - CRITICAL for bet data sync',
        critical: true,
        endpoints: ['/api/bets/sync']
      },
      {
        name: 'unified-pool-settlement-system',
        type: 'settlement',
        description: 'Unified pool settlement system',
        critical: true,
        endpoints: ['/api/pools/settle']
      },
      {
        name: 'cron-coordinator',
        type: 'scheduler',
        description: 'Cron job coordination service',
        critical: true,
        endpoints: ['/api/cron']
      },
      {
        name: 'system-monitor',
        type: 'monitoring',
        description: 'System health monitoring service',
        critical: true,
        endpoints: ['/api/health']
      },
      {
        name: 'shared-query-service',
        type: 'database',
        description: 'Shared database query service',
        critical: true,
        endpoints: []
      },
      {
        name: 'enhanced-analytics-service',
        type: 'analytics',
        description: 'Enhanced analytics service',
        critical: false,
        endpoints: ['/api/analytics']
      },
      {
        name: 'optimized-leaderboard-service',
        type: 'leaderboard',
        description: 'Optimized leaderboard service',
        critical: false,
        endpoints: ['/api/leaderboards']
      },
      {
        name: 'reputation-sync-service',
        type: 'reputation',
        description: 'Reputation synchronization service',
        critical: false,
        endpoints: ['/api/reputation']
      },
      {
        name: 'oddyssey-manager',
        type: 'oddyssey',
        description: 'Oddyssey game management service',
        critical: false,
        endpoints: ['/api/oddyssey']
      },
      {
        name: 'guided-market-service',
        type: 'market',
        description: 'Guided market service',
        critical: false,
        endpoints: ['/api/guided-markets']
      },
      {
        name: 'sportmonks',
        type: 'external',
        description: 'SportMonks API integration service',
        critical: false,
        endpoints: []
      },
      {
        name: 'database-optimization-service',
        type: 'optimization',
        description: 'Database optimization service',
        critical: false,
        endpoints: ['/api/database-optimization']
      }
    ];

    for (const serviceInfo of servicesToRegister) {
      await this.serviceRegistry.registerService(serviceInfo.name, serviceInfo);
      console.log(`  ✅ Registered: ${serviceInfo.name}`);
    }
  }

  /**
   * Set up service dependencies
   */
  async setupDependencies() {
    console.log('🔗 Setting up service dependencies...');
    
    const dependencies = [
      // Core dependencies
      { service: 'unified-pool-settlement-system', deps: ['event-driven-pool-sync', 'shared-query-service'] },
      { service: 'event-driven-pool-sync', deps: ['web3-service', 'database'] },
      { service: 'event-driven-bet-sync', deps: ['web3-service', 'database'] },
      { service: 'enhanced-analytics-service', deps: ['shared-query-service'] },
      { service: 'optimized-leaderboard-service', deps: ['shared-query-service', 'enhanced-analytics-service'] },
      { service: 'reputation-sync-service', deps: ['shared-query-service'] },
      { service: 'oddyssey-manager', deps: ['shared-query-service', 'reputation-sync-service'] },
      { service: 'guided-market-service', deps: ['shared-query-service', 'sportmonks'] },
      { service: 'database-optimization-service', deps: ['shared-query-service'] },
      
      // Monitoring dependencies
      { service: 'system-monitor', deps: ['shared-query-service'] },
      { service: 'enhanced-health-monitoring', deps: ['service-registry', 'dependency-graph-service'] },
      
      // External service dependencies
      { service: 'sportmonks', deps: [] }
    ];

    for (const { service, deps } of dependencies) {
      for (const dep of deps) {
        await this.serviceRegistry.addDependency(service, dep);
      }
      console.log(`  ✅ Dependencies set for: ${service}`);
    }
  }

  /**
   * Perform initial health checks
   */
  async performInitialHealthChecks() {
    console.log('🔍 Performing initial health checks...');
    
    try {
      await this.enhancedHealthMonitoring.performAllHealthChecks();
      console.log('  ✅ Initial health checks completed');
    } catch (error) {
      console.warn('  ⚠️ Some health checks failed:', error.message);
    }
  }

  /**
   * Generate reports
   */
  async generateReports() {
    console.log('📊 Generating reports...');
    
    try {
      // Service registry statistics
      const statistics = this.serviceRegistry.getServiceStatistics();
      console.log(`  📈 Total services: ${statistics.totalServices}`);
      console.log(`  📈 Services by type:`, statistics.servicesByType);
      console.log(`  📈 Services by status:`, statistics.servicesByStatus);
      
      // Dependency graph analysis
      const dependencyReport = this.dependencyGraph.generateDependencyReport();
      console.log(`  🔗 Total dependencies: ${dependencyReport.summary.totalDependencies}`);
      console.log(`  🔗 Circular dependencies: ${dependencyReport.summary.circularDependencies}`);
      
      // Health monitoring overview
      const healthOverview = this.enhancedHealthMonitoring.getSystemHealthOverview();
      console.log(`  🏥 Overall health: ${healthOverview.overallHealth}`);
      console.log(`  🏥 Healthy services: ${healthOverview.healthyServices}/${healthOverview.totalServices}`);
      
      // Validation
      const validation = this.dependencyGraph.validateDependencyGraph();
      if (validation.length > 0) {
        console.log(`  ⚠️ Validation issues: ${validation.length}`);
        validation.forEach(issue => {
          console.log(`    - ${issue.type}: ${issue.message}`);
        });
      } else {
        console.log(`  ✅ No validation issues found`);
      }
      
    } catch (error) {
      console.error('  ❌ Failed to generate reports:', error);
    }
  }
}

// Run initialization if called directly
if (require.main === module) {
  const initializer = new ServiceRegistryInitializer();
  initializer.run().catch(console.error);
}

module.exports = ServiceRegistryInitializer;
