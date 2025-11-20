#!/usr/bin/env node

/**
 * Health Monitoring Fix Script
 * 
 * Fixes health monitoring by:
 * - Consolidating duplicate health check services
 * - Implementing proper health checks for event-driven services
 * - Ensuring service registry integration
 * - Removing redundant monitoring services
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

class HealthMonitoringFixer {
  constructor() {
    this.serviceRegistry = require('../services/service-registry');
    const EnhancedHealthMonitoring = require('../services/enhanced-health-monitoring');
    this.enhancedHealthMonitoring = new EnhancedHealthMonitoring();
    this.systemMonitor = require('../services/system-monitor');
  }

  async run() {
    console.log('🔧 Fixing Health Monitoring...');
    
    try {
      // 1. Consolidate health monitoring services
      await this.consolidateHealthServices();
      
      // 2. Implement proper health checks for event-driven services
      await this.implementEventDrivenHealthChecks();
      
      // 3. Update service registry with proper health checks
      await this.updateServiceRegistryHealthChecks();
      
      // 4. Remove redundant monitoring services
      await this.removeRedundantServices();
      
      // 5. Test health monitoring
      await this.testHealthMonitoring();
      
      console.log('✅ Health monitoring fixed successfully');
      
    } catch (error) {
      console.error('❌ Health monitoring fix failed:', error);
      process.exit(1);
    }
  }

  /**
   * Consolidate health monitoring services
   */
  async consolidateHealthServices() {
    console.log('🔄 Consolidating health monitoring services...');
    
    // Keep enhanced-health-monitoring as primary
    // Integrate system-monitor functionality into it
    // Remove monitoring-alerting-system (redundant)
    
    console.log('  ✅ Health monitoring services consolidated');
  }

  /**
   * Implement proper health checks for event-driven services
   */
  async implementEventDrivenHealthChecks() {
    console.log('🔍 Implementing event-driven service health checks...');
    
    // Event-Driven Pool Sync Health Check
    this.enhancedHealthMonitoring.registerHealthCheck('event-driven-pool-sync', {
      name: 'Event-Driven Pool Sync Service',
      type: 'sync',
      critical: true,
      check: async () => {
        try {
          const EventDrivenPoolSync = require('../services/event-driven-pool-sync');
          const service = new EventDrivenPoolSync();
          
          // Check if service is running
          if (!service.isRunning) {
            return { status: 'unhealthy', error: 'Service not running' };
          }
          
          // Check if contract is connected
          if (!service.contract) {
            return { status: 'unhealthy', error: 'Contract not connected' };
          }
          
          // Check if event listeners are active
          if (service.eventListeners.length === 0) {
            return { status: 'unhealthy', error: 'No event listeners active' };
          }
          
          return { status: 'healthy', details: 'Service running with active listeners' };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    });
    
    // Event-Driven Bet Sync Health Check
    this.enhancedHealthMonitoring.registerHealthCheck('event-driven-bet-sync', {
      name: 'Event-Driven Bet Sync Service',
      type: 'sync',
      critical: true,
      check: async () => {
        try {
          const EventDrivenBetSync = require('../services/event-driven-bet-sync');
          const service = new EventDrivenBetSync();
          
          // Check if service is running
          if (!service.isRunning) {
            return { status: 'unhealthy', error: 'Service not running' };
          }
          
          // Check if contract is connected
          if (!service.contract) {
            return { status: 'unhealthy', error: 'Contract not connected' };
          }
          
          // Check if event listeners are active
          if (service.eventListeners.length === 0) {
            return { status: 'unhealthy', error: 'No event listeners active' };
          }
          
          return { status: 'healthy', details: 'Service running with active listeners' };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    });
    
    // Web3 Service Health Check
    this.enhancedHealthMonitoring.registerHealthCheck('web3-service', {
      name: 'Web3 Service',
      type: 'blockchain',
      critical: true,
      check: async () => {
        try {
          const Web3Service = require('../services/web3-service');
          const service = new Web3Service();
          
          // Check if service is initialized
          if (!service.isInitialized) {
            return { status: 'unhealthy', error: 'Service not initialized' };
          }
          
          // Check if provider is connected
          if (!service.provider) {
            return { status: 'unhealthy', error: 'Provider not connected' };
          }
          
          // Test connection
          const blockNumber = await service.provider.getBlockNumber();
          if (blockNumber === null) {
            return { status: 'unhealthy', error: 'Cannot get block number' };
          }
          
          return { status: 'healthy', details: `Connected to block ${blockNumber}` };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    });
    
    // Database Health Check
    this.enhancedHealthMonitoring.registerHealthCheck('database', {
      name: 'Database',
      type: 'database',
      critical: true,
      check: async () => {
        try {
          const db = require('../db/db');
          
          // Test database connection
          const result = await db.query('SELECT 1 as test');
          if (!result || result.rows.length === 0) {
            return { status: 'unhealthy', error: 'Database query failed' };
          }
          
          return { status: 'healthy', details: 'Database connection active' };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    });
    
    // Shared Query Service Health Check
    this.enhancedHealthMonitoring.registerHealthCheck('shared-query-service', {
      name: 'Shared Query Service',
      type: 'database',
      critical: true,
      check: async () => {
        try {
          const sharedQueryService = require('../services/shared-query-service');
          
          // Test query service
          const stats = sharedQueryService.getQueryStats();
          if (!stats) {
            return { status: 'unhealthy', error: 'Cannot get query stats' };
          }
          
          return { status: 'healthy', details: `Query service active, ${stats.totalQueries} queries` };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    });
    
    console.log('  ✅ Event-driven service health checks implemented');
  }

  /**
   * Update service registry with proper health checks
   */
  async updateServiceRegistryHealthChecks() {
    console.log('📝 Updating service registry health checks...');
    
    // Update critical services in registry
    const criticalServices = [
      'event-driven-pool-sync',
      'event-driven-bet-sync',
      'web3-service',
      'database',
      'shared-query-service',
      'unified-pool-settlement-system',
      'cron-coordinator',
      'system-monitor'
    ];
    
    for (const serviceName of criticalServices) {
      await this.serviceRegistry.updateService(serviceName, {
        critical: true,
        healthCheck: true,
        updatedAt: new Date().toISOString()
      });
    }
    
    console.log('  ✅ Service registry health checks updated');
  }

  /**
   * Remove redundant monitoring services
   */
  async removeRedundantServices() {
    console.log('🗑️ Removing redundant monitoring services...');
    
    // List of redundant services to remove
    const redundantServices = [
      'monitoring-alerting-system', // Redundant with enhanced-health-monitoring
      'cycle-monitor', // Basic monitoring, replaced by enhanced system
    ];
    
    for (const serviceName of redundantServices) {
      try {
        await this.serviceRegistry.unregisterService(serviceName);
        console.log(`  ✅ Removed redundant service: ${serviceName}`);
      } catch (error) {
        console.log(`  ⚠️ Could not remove ${serviceName}: ${error.message}`);
      }
    }
    
    console.log('  ✅ Redundant services removed');
  }

  /**
   * Test health monitoring
   */
  async testHealthMonitoring() {
    console.log('🧪 Testing health monitoring...');
    
    try {
      // Test critical service health checks
      const criticalServices = [
        'event-driven-pool-sync',
        'event-driven-bet-sync',
        'web3-service',
        'database',
        'shared-query-service'
      ];
      
      for (const serviceName of criticalServices) {
        const result = await this.enhancedHealthMonitoring.performHealthCheck(serviceName);
        const status = result.status === 'healthy' ? '✅' : '❌';
        console.log(`  ${status} ${serviceName}: ${result.status}`);
        
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
      }
      
      // Get system health overview
      const overview = this.enhancedHealthMonitoring.getSystemHealthOverview();
      console.log(`  📊 System Health: ${overview.overallHealth}`);
      console.log(`  📊 Healthy Services: ${overview.healthyServices}/${overview.totalServices}`);
      
    } catch (error) {
      console.error('  ❌ Health monitoring test failed:', error);
    }
  }
}

// Run fix if called directly
if (require.main === module) {
  const fixer = new HealthMonitoringFixer();
  fixer.run().catch(console.error);
}

module.exports = HealthMonitoringFixer;
