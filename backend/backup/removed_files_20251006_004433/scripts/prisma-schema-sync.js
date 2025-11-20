#!/usr/bin/env node

/**
 * PRISMA SCHEMA SYNC ANALYZER
 * 
 * This script compares the Prisma schema with the perfect-schema.sql
 * to identify missing models and ensure they are in sync.
 */

const fs = require('fs');
const path = require('path');

class PrismaSchemaSyncAnalyzer {
  constructor() {
    this.prismaSchemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    this.perfectSchemaPath = path.join(__dirname, '..', 'database', 'perfect-schema.sql');
    this.prismaModels = new Map(); // modelName -> modelInfo
    this.perfectTables = new Map(); // tableName -> tableInfo
  }

  /**
   * Parse Prisma schema to extract models
   */
  parsePrismaSchema() {
    console.log('📖 Parsing Prisma schema...');
    
    if (!fs.existsSync(this.prismaSchemaPath)) {
      throw new Error('Prisma schema file not found!');
    }

    const content = fs.readFileSync(this.prismaSchemaPath, 'utf8');
    
    // Extract model definitions
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const modelContent = match[2];
      
      // Extract table mapping
      const mapMatch = modelContent.match(/@@map\("([^"]+)"\)/);
      const tableName = mapMatch ? mapMatch[1] : modelName.toLowerCase();
      
      // Extract fields
      const fields = this.extractPrismaFields(modelContent);
      
      this.prismaModels.set(modelName, {
        tableName,
        fields,
        content: modelContent
      });
    }

    console.log(`✅ Prisma schema parsed: ${this.prismaModels.size} models`);
  }

  /**
   * Extract fields from Prisma model content
   */
  extractPrismaFields(modelContent) {
    const fields = new Map();
    
    // Extract field definitions
    const fieldRegex = /(\w+)\s+([^@\n]+?)(?:\s+@[^@\n]*)?$/gm;
    let match;
    
    while ((match = fieldRegex.exec(modelContent)) !== null) {
      const fieldName = match[1].trim();
      const fieldType = match[2].trim();
      
      // Skip relations and other non-field lines
      if (fieldName === '//' || fieldName.startsWith('@@') || fieldName.includes('// Relations')) {
        continue;
      }
      
      fields.set(fieldName, fieldType);
    }
    
    return fields;
  }

  /**
   * Parse perfect schema to extract tables
   */
  parsePerfectSchema() {
    console.log('📖 Parsing perfect schema...');
    
    if (!fs.existsSync(this.perfectSchemaPath)) {
      throw new Error('Perfect schema file not found!');
    }

    const content = fs.readFileSync(this.perfectSchemaPath, 'utf8');
    
    // Extract table definitions
    const tableRegex = /CREATE TABLE IF NOT EXISTS (\w+\.\w+)/g;
    let match;
    
    while ((match = tableRegex.exec(content)) !== null) {
      const fullTableName = match[1];
      const [schema, tableName] = fullTableName.split('.');
      
      // Find the table block
      const tableBlockStart = content.indexOf(match[0]);
      const tableBlockEnd = content.indexOf(');', tableBlockStart);
      const tableBlock = content.substring(tableBlockStart, tableBlockEnd);
      
      // Extract columns
      const columns = this.extractSqlColumns(tableBlock);
      
      this.perfectTables.set(fullTableName, {
        schema,
        tableName,
        columns,
        fullTableName
      });
    }

    console.log(`✅ Perfect schema parsed: ${this.perfectTables.size} tables`);
  }

  /**
   * Extract columns from SQL table definition
   */
  extractSqlColumns(tableBlock) {
    const columns = new Map();
    
    // Extract column definitions
    const columnRegex = /^\s*(\w+)\s+([^,\n]+?)(?:,|$)/gm;
    let match;
    
    while ((match = columnRegex.exec(tableBlock)) !== null) {
      const columnName = match[1].trim();
      const columnType = match[2].trim();
      
      // Skip constraints and other non-column lines
      if (columnName === 'PRIMARY' || columnName === 'FOREIGN' || columnName === 'UNIQUE' || 
          columnName === 'CONSTRAINT' || columnName === '--' || columnName.startsWith('--')) {
        continue;
      }
      
      columns.set(columnName, columnType);
    }
    
    return columns;
  }

  /**
   * Compare Prisma models with perfect schema tables
   */
  compareSchemas() {
    console.log('🔍 Comparing schemas...');
    
    const missingInPrisma = [];
    const extraInPrisma = [];
    const fieldMismatches = [];
    
    // Check for tables in perfect schema that are missing in Prisma
    for (const [fullTableName, tableInfo] of this.perfectTables) {
      const foundInPrisma = Array.from(this.prismaModels.values()).find(
        model => model.tableName === fullTableName
      );
      
      if (!foundInPrisma) {
        missingInPrisma.push({
          tableName: fullTableName,
          schema: tableInfo.schema,
          table: tableInfo.tableName,
          columns: tableInfo.columns.size
        });
      }
    }
    
    // Check for models in Prisma that don't exist in perfect schema
    for (const [modelName, modelInfo] of this.prismaModels) {
      const foundInPerfect = this.perfectTables.has(modelInfo.tableName);
      
      if (!foundInPerfect) {
        extraInPrisma.push({
          modelName,
          tableName: modelInfo.tableName
        });
      }
    }
    
    return {
      missingInPrisma,
      extraInPrisma,
      fieldMismatches
    };
  }

  /**
   * Generate Prisma models for missing tables
   */
  generateMissingPrismaModels(missingTables) {
    console.log('📝 Generating missing Prisma models...');
    
    let generatedModels = '';
    
    for (const table of missingTables) {
      const modelName = this.generateModelName(table.table);
      const columns = table.columns;
      
      generatedModels += `\n// =====================================================\n`;
      generatedModels += `// ${table.schema.toUpperCase()} SCHEMA - ${table.table.toUpperCase()}\n`;
      generatedModels += `// =====================================================\n\n`;
      
      generatedModels += `model ${modelName} {\n`;
      
      // Add basic fields (you'll need to customize these based on actual columns)
      generatedModels += `  id        String   @id @default(cuid())\n`;
      generatedModels += `  createdAt DateTime @default(now()) @map("created_at")\n`;
      generatedModels += `  updatedAt DateTime @updatedAt @map("updated_at")\n\n`;
      
      generatedModels += `  @@map("${table.tableName}")\n`;
      generatedModels += `}\n`;
    }
    
    return generatedModels;
  }

  /**
   * Generate a model name from table name
   */
  generateModelName(tableName) {
    // Convert snake_case to PascalCase
    return tableName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\n📊 GENERATING PRISMA SCHEMA SYNC REPORT');
    console.log('=========================================\n');

    const comparison = this.compareSchemas();
    
    // 1. Missing Models in Prisma
    console.log('1. MISSING MODELS IN PRISMA');
    console.log('----------------------------');
    
    if (comparison.missingInPrisma.length === 0) {
      console.log('✅ All tables from perfect schema have corresponding Prisma models');
    } else {
      console.log(`❌ ${comparison.missingInPrisma.length} tables missing from Prisma schema:`);
      comparison.missingInPrisma.forEach(table => {
        console.log(`   - ${table.tableName} (${table.columns} columns)`);
      });
    }

    // 2. Extra Models in Prisma
    console.log('\n2. EXTRA MODELS IN PRISMA');
    console.log('-------------------------');
    
    if (comparison.extraInPrisma.length === 0) {
      console.log('✅ No extra models in Prisma schema');
    } else {
      console.log(`⚠️ ${comparison.extraInPrisma.length} models in Prisma not in perfect schema:`);
      comparison.extraInPrisma.forEach(model => {
        console.log(`   - ${model.modelName} (maps to ${model.tableName})`);
      });
    }

    // 3. Summary
    console.log('\n3. SUMMARY');
    console.log('----------');
    
    const totalPerfectTables = this.perfectTables.size;
    const totalPrismaModels = this.prismaModels.size;
    const missingCount = comparison.missingInPrisma.length;
    const extraCount = comparison.extraInPrisma.length;
    
    console.log(`Perfect schema tables: ${totalPerfectTables}`);
    console.log(`Prisma models: ${totalPrismaModels}`);
    console.log(`Missing in Prisma: ${missingCount}`);
    console.log(`Extra in Prisma: ${extraCount}`);
    
    if (missingCount === 0 && extraCount === 0) {
      console.log('✅ Prisma schema is perfectly synced with database schema!');
    } else {
      console.log('❌ Prisma schema needs to be updated');
    }

    // 4. Generate missing models if any
    if (comparison.missingInPrisma.length > 0) {
      console.log('\n4. GENERATED MISSING MODELS');
      console.log('---------------------------');
      const generatedModels = this.generateMissingPrismaModels(comparison.missingInPrisma);
      console.log(generatedModels);
      
      // Save to file
      const outputPath = path.join(__dirname, 'missing-prisma-models.prisma');
      fs.writeFileSync(outputPath, generatedModels);
      console.log(`\n📄 Generated models saved to: ${outputPath}`);
    }

    // 5. Save detailed report
    this.saveDetailedReport(comparison);
  }

  /**
   * Save detailed report to file
   */
  saveDetailedReport(comparison) {
    const report = {
      timestamp: new Date().toISOString(),
      perfectSchema: {
        totalTables: this.perfectTables.size,
        tables: Array.from(this.perfectTables.keys()).sort()
      },
      prismaSchema: {
        totalModels: this.prismaModels.size,
        models: Array.from(this.prismaModels.keys()).sort()
      },
      comparison: {
        missingInPrisma: comparison.missingInPrisma,
        extraInPrisma: comparison.extraInPrisma,
        fieldMismatches: comparison.fieldMismatches
      }
    };

    const reportPath = path.join(__dirname, 'prisma-sync-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  /**
   * Run the complete analysis
   */
  async run() {
    try {
      console.log('🚀 Starting Prisma Schema Sync Analysis...\n');
      
      this.parsePrismaSchema();
      this.parsePerfectSchema();
      this.generateReport();
      
      console.log('\n✅ Analysis complete!');
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  }
}

// Run the analyzer
if (require.main === module) {
  const analyzer = new PrismaSchemaSyncAnalyzer();
  analyzer.run();
}

module.exports = PrismaSchemaSyncAnalyzer;
