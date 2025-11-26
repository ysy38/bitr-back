const db = require('../db/db');

/**
 * Alert Handler Service
 * 
 * Handles system alerts and notifications when services fail or degrade.
 * Supports multiple notification channels (console, database, webhook, email).
 */
class AlertHandler {
  constructor() {
    this.isEnabled = true;
    this.notificationChannels = {
      console: true,
      database: true,
      webhook: process.env.ALERT_WEBHOOK_URL ? true : false,
      email: process.env.ALERT_EMAIL ? true : false
    };
    
    this.alertCooldown = 15 * 60 * 1000; // 15 minutes
    this.lastAlerts = new Map(); // Track last alert time per health check
  }

  /**
   * Handle system alert
   */
  async handleAlert(alertData) {
    if (!this.isEnabled) return;

    const { healthCheckId, healthCheckName, alerts, timestamp } = alertData;

    // Check cooldown to prevent spam
    if (this.isInCooldown(healthCheckId)) {
      console.log(`⚠️ Alert for ${healthCheckName} is in cooldown, skipping...`);
      return;
    }

    console.log(`🚨 ALERT: ${healthCheckName} - ${alerts.length} issues detected`);

    // Process each alert
    for (const alert of alerts) {
      await this.processAlert(healthCheckId, healthCheckName, alert, timestamp);
    }

    // Update cooldown
    this.lastAlerts.set(healthCheckId, timestamp);
  }

  /**
   * Process individual alert
   */
  async processAlert(healthCheckId, healthCheckName, alert, timestamp) {
    const alertMessage = this.formatAlertMessage(healthCheckId, healthCheckName, alert, timestamp);

    // Console notification
    if (this.notificationChannels.console) {
      this.sendConsoleAlert(alertMessage, alert.severity);
    }

    // Database logging
    if (this.notificationChannels.database) {
      await this.logAlertToDatabase(healthCheckId, alert, timestamp);
    }

    // Webhook notification
    if (this.notificationChannels.webhook) {
      await this.sendWebhookAlert(alertMessage, alert.severity);
    }

    // Email notification
    if (this.notificationChannels.email) {
      await this.sendEmailAlert(alertMessage, alert.severity);
    }
  }

  /**
   * Format alert message
   */
  formatAlertMessage(healthCheckId, healthCheckName, alert, timestamp) {
    const timeStr = timestamp.toISOString();
    const severityIcon = this.getSeverityIcon(alert.severity);
    
    return `${severityIcon} **${alert.severity.toUpperCase()} ALERT** - ${healthCheckName}
    
**Issue Type:** ${alert.type}
**Message:** ${alert.message}
**Threshold:** ${alert.threshold}
**Current Value:** ${alert.current}
**Timestamp:** ${timeStr}
**Health Check ID:** ${healthCheckId}`;
  }

  /**
   * Get severity icon
   */
  getSeverityIcon(severity) {
    switch (severity.toLowerCase()) {
      case 'critical': return '🚨';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  }

  /**
   * Send console alert
   */
  sendConsoleAlert(message, severity) {
    const color = severity === 'critical' ? '\x1b[31m' : '\x1b[33m'; // Red for critical, yellow for warning
    const reset = '\x1b[0m';
    
    console.log(`${color}${message}${reset}`);
  }

  /**
   * Log alert to database
   */
  async logAlertToDatabase(healthCheckId, alert, timestamp) {
    try {
      await db.query(`
        INSERT INTO oracle.system_alerts (
          health_check_id, alert_type, severity, message
        ) VALUES ($1, $2, $3, $4)
      `, [
        healthCheckId,
        alert.type,
        alert.severity,
        alert.message
      ]);
    } catch (error) {
      console.error('Failed to log alert to database:', error);
    }
  }

  /**
   * Send webhook alert
   */
  async sendWebhookAlert(message, severity) {
    try {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (!webhookUrl) return;

      const payload = {
        text: message,
        severity: severity,
        timestamp: new Date().toISOString()
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`Webhook alert failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Send email alert
   */
  async sendEmailAlert(message, severity) {
    try {
      const emailAddress = process.env.ALERT_EMAIL;
      if (!emailAddress) return;

      // This would integrate with your email service (SendGrid, AWS SES, etc.)
      // For now, just log the email that would be sent
      console.log(`📧 EMAIL ALERT (${severity}) to ${emailAddress}:`);
      console.log(message);
      
      // Example integration with a hypothetical email service:
      // await emailService.send({
      //   to: emailAddress,
      //   subject: `[${severity.toUpperCase()}] System Alert - ${new Date().toISOString()}`,
      //   body: message
      // });
      
    } catch (error) {
      console.error('Failed to send email alert:', error);
    }
  }

  /**
   * Check if alert is in cooldown
   */
  isInCooldown(healthCheckId) {
    const lastAlert = this.lastAlerts.get(healthCheckId);
    if (!lastAlert) return false;

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    return timeSinceLastAlert < this.alertCooldown;
  }

  /**
   * Resolve alert
   */
  async resolveAlert(healthCheckId, alertType) {
    try {
      await db.query(`
        UPDATE oracle.system_alerts 
        SET resolved = true, resolved_at = NOW()
        WHERE health_check_id = $1 
        AND alert_type = $2 
        AND resolved = false
      `, [healthCheckId, alertType]);

      console.log(`✅ Alert resolved: ${healthCheckId} - ${alertType}`);
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.system_alerts 
        WHERE resolved = false 
        ORDER BY created_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('Failed to get active alerts:', error);
      return [];
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats() {
    try {
      const result = await db.query(`
        SELECT 
          severity,
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE resolved = true) as resolved_alerts,
          COUNT(*) FILTER (WHERE resolved = false) as active_alerts,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_time_seconds
        FROM oracle.system_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY severity
      `);

      return result.rows;
    } catch (error) {
      console.error('Failed to get alert statistics:', error);
      return [];
    }
  }

  /**
   * Enable/disable alert handler
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`Alert handler ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Configure notification channels
   */
  configureChannels(channels) {
    this.notificationChannels = { ...this.notificationChannels, ...channels };
    console.log('Notification channels updated:', this.notificationChannels);
  }

  /**
   * Set alert cooldown
   */
  setCooldown(cooldownMs) {
    this.alertCooldown = cooldownMs;
    console.log(`Alert cooldown set to ${cooldownMs}ms`);
  }
}

module.exports = AlertHandler;
