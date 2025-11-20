#!/usr/bin/env node

/**
 * Schema Audit Runner
 * 
 * Simple script to run the database schema audit
 */

require('dotenv').config();
const DatabaseSchemaAuditor = require('./database-schema-audit');

async function runAudit() {
  console.log('🚀 Starting Database Schema Audit...\n');
  
  const auditor = new DatabaseSchemaAuditor();
  
  try {
    await auditor.runAudit();
    process.exit(0);
  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

runAudit();
