const CycleDetector = require('./detect-missing-cycles');
const db = require('../db/db');

class CycleHealthMonitor {
  constructor() {
    this.detector = new CycleDetector();
    this.alertThreshold = 1; // Alert if more than 1 cycle is missing
  }

  async runHealthCheck() {
    try {
      console.log('🏥 Running cycle health check...');
      
      // Detect missing cycles
      const result = await this.detector.detectMissingCycles();
      
      // Check for anomalies
      const anomalies = await this.detectAnomalies();
      
      // Generate health report
      const healthReport = {
        timestamp: new Date().toISOString(),
        totalCycles: result.totalCycles,
        missingCycles: result.missingCycles.length,
        anomalies: anomalies,
        status: this.determineHealthStatus(result, anomalies),
        recommendations: this.generateRecommendations(result, anomalies)
      };

      // Log health report
      console.log('\n📊 Cycle Health Report:');
      console.log(`   Status: ${healthReport.status}`);
      console.log(`   Total Cycles: ${healthReport.totalCycles}`);
      console.log(`   Missing Cycles: ${healthReport.missingCycles}`);
      console.log(`   Anomalies: ${anomalies.length}`);
      
      if (healthReport.recommendations.length > 0) {
        console.log('\n🔧 Recommendations:');
        healthReport.recommendations.forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec}`);
        });
      }

      // Store health report in database
      await this.storeHealthReport(healthReport);

      // Return health status for monitoring
      return healthReport;

    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }

  async detectAnomalies() {
    const anomalies = [];
    
    try {
      // Check for cycles created outside normal hours (00:00-00:10 UTC)
      const result = await db.query(`
        SELECT cycle_id, created_at, EXTRACT(HOUR FROM created_at) as hour_created, EXTRACT(MINUTE FROM created_at) as minute_created
        FROM oracle.oddyssey_cycles 
        WHERE NOT (EXTRACT(HOUR FROM created_at) = 0 AND EXTRACT(MINUTE FROM created_at) BETWEEN 0 AND 10)
        ORDER BY cycle_id
      `);

      result.rows.forEach(cycle => {
        anomalies.push({
          type: 'off_schedule_creation',
          cycleId: cycle.cycle_id,
          message: `Cycle ${cycle.cycle_id} created at ${cycle.hour_created}:${cycle.minute_created.toString().padStart(2, '0')} UTC (outside normal 00:00-00:10 window)`,
          severity: 'warning'
        });
      });

      // Check for cycles with no matches
      const noMatchesResult = await db.query(`
        SELECT c.cycle_id, c.created_at
        FROM oracle.oddyssey_cycles c
        LEFT JOIN oracle.daily_game_matches dgm ON c.cycle_id = dgm.cycle_id
        WHERE dgm.cycle_id IS NULL
        ORDER BY c.cycle_id
      `);

      noMatchesResult.rows.forEach(cycle => {
        anomalies.push({
          type: 'no_matches',
          cycleId: cycle.cycle_id,
          message: `Cycle ${cycle.cycle_id} has no matches in database`,
          severity: 'error'
        });
      });

      // Check for cycles created on same day
      const sameDayResult = await db.query(`
        SELECT 
          cycle_id, 
          created_at,
          DATE(created_at) as date_created,
          COUNT(*) OVER (PARTITION BY DATE(created_at)) as cycles_per_day
        FROM oracle.oddyssey_cycles 
        ORDER BY created_at
      `);

      sameDayResult.rows.forEach(cycle => {
        if (cycle.cycles_per_day > 1) {
          anomalies.push({
            type: 'multiple_cycles_same_day',
            cycleId: cycle.cycle_id,
            message: `Multiple cycles (${cycle.cycles_per_day}) created on ${cycle.date_created}`,
            severity: 'warning'
          });
        }
      });

    } catch (error) {
      console.error('❌ Error detecting anomalies:', error);
    }

    return anomalies;
  }

  determineHealthStatus(result, anomalies) {
    if (result.missingCycles.length > this.alertThreshold) {
      return 'CRITICAL';
    }
    
    const errorAnomalies = anomalies.filter(a => a.severity === 'error');
    if (errorAnomalies.length > 0) {
      return 'ERROR';
    }
    
    const warningAnomalies = anomalies.filter(a => a.severity === 'warning');
    if (warningAnomalies.length > 0) {
      return 'WARNING';
    }
    
    return 'HEALTHY';
  }

  generateRecommendations(result, anomalies) {
    const recommendations = [];
    
    if (result.missingCycles.length > 0) {
      recommendations.push('Investigate missing cycles - check cron job logs and manual interventions');
    }
    
    const offScheduleAnomalies = anomalies.filter(a => a.type === 'off_schedule_creation');
    if (offScheduleAnomalies.length > 0) {
      recommendations.push('Review cycle creation timing - ensure cron jobs are running at correct times');
    }
    
    const noMatchesAnomalies = anomalies.filter(a => a.type === 'no_matches');
    if (noMatchesAnomalies.length > 0) {
      recommendations.push('Check contract sync process - cycles without matches indicate sync failures');
    }
    
    const multipleCyclesAnomalies = anomalies.filter(a => a.type === 'multiple_cycles_same_day');
    if (multipleCyclesAnomalies.length > 0) {
      recommendations.push('Investigate duplicate cycle creation - check for manual interventions or cron job duplicates');
    }
    
    return recommendations;
  }

  async storeHealthReport(report) {
    try {
      // Create health monitoring table if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.cycle_health_reports (
          id BIGSERIAL PRIMARY KEY,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          status VARCHAR(20) NOT NULL,
          total_cycles INTEGER NOT NULL,
          missing_cycles INTEGER NOT NULL,
          anomalies_count INTEGER NOT NULL,
          report_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Store the report
      await db.query(`
        INSERT INTO oracle.cycle_health_reports 
        (timestamp, status, total_cycles, missing_cycles, anomalies_count, report_data)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        report.timestamp,
        report.status,
        report.totalCycles,
        report.missingCycles,
        report.anomalies.length,
        JSON.stringify(report)
      ]);

    } catch (error) {
      console.error('❌ Error storing health report:', error);
    }
  }

  async getRecentHealthReports(limit = 10) {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.cycle_health_reports 
        ORDER BY timestamp DESC 
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error('❌ Error getting health reports:', error);
      return [];
    }
  }
}

// Run health check if called directly
if (require.main === module) {
  const monitor = new CycleHealthMonitor();
  
  monitor.runHealthCheck()
    .then(report => {
      if (report.status === 'CRITICAL' || report.status === 'ERROR') {
        process.exit(1); // Exit with error code for critical issues
      } else {
        process.exit(0); // Exit successfully for warnings or healthy status
      }
    })
    .catch(error => {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    });
}

module.exports = CycleHealthMonitor;
