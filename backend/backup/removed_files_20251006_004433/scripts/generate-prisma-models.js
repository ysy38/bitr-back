#!/usr/bin/env node

/**
 * PRISMA MODEL GENERATOR
 * 
 * This script generates proper Prisma models with correct fields
 * based on the perfect-schema.sql file.
 */

const fs = require('fs');
const path = require('path');

class PrismaModelGenerator {
  constructor() {
    this.perfectSchemaPath = path.join(__dirname, '..', 'database', 'perfect-schema.sql');
    this.sqlTables = new Map();
  }

  /**
   * Parse SQL schema to extract table definitions
   */
  parseSqlSchema() {
    console.log('📖 Parsing SQL schema...');
    
    const content = fs.readFileSync(this.perfectSchemaPath, 'utf8');
    
    // Extract table definitions
    const tableRegex = /CREATE TABLE IF NOT EXISTS (\w+\.\w+)\s*\(([^)]+)\)/g;
    let match;
    
    while ((match = tableRegex.exec(content)) !== null) {
      const fullTableName = match[1];
      const tableContent = match[2];
      
      const [schema, tableName] = fullTableName.split('.');
      const columns = this.extractColumns(tableContent);
      
      this.sqlTables.set(fullTableName, {
        schema,
        tableName,
        columns,
        fullTableName
      });
    }
    
    console.log(`✅ Parsed ${this.sqlTables.size} tables`);
  }

  /**
   * Extract columns from table definition
   */
  extractColumns(tableContent) {
    const columns = [];
    const lines = tableContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines, comments, and constraints
      if (!trimmedLine || trimmedLine.startsWith('--') || 
          trimmedLine.startsWith('PRIMARY KEY') || 
          trimmedLine.startsWith('FOREIGN KEY') ||
          trimmedLine.startsWith('UNIQUE') ||
          trimmedLine.startsWith('CONSTRAINT')) {
        continue;
      }
      
      // Extract column definition
      const columnMatch = trimmedLine.match(/^(\w+)\s+([^,]+?)(?:\s+DEFAULT\s+([^,]+))?(?:\s+NOT NULL)?(?:\s+PRIMARY KEY)?,?$/);
      
      if (columnMatch) {
        const [, columnName, columnType, defaultValue] = columnMatch;
        columns.push({
          name: columnName.trim(),
          type: columnType.trim(),
          defaultValue: defaultValue ? defaultValue.trim() : null
        });
      }
    }
    
    return columns;
  }

  /**
   * Convert SQL type to Prisma type
   */
  convertSqlTypeToPrisma(sqlType) {
    const type = sqlType.toLowerCase();
    
    // Handle common SQL types
    if (type.includes('varchar') || type.includes('text') || type.includes('char')) {
      return 'String';
    }
    if (type.includes('int') || type.includes('serial')) {
      if (type.includes('bigint') || type.includes('bigserial')) {
        return 'BigInt';
      }
      return 'Int';
    }
    if (type.includes('decimal') || type.includes('numeric')) {
      return 'Decimal';
    }
    if (type.includes('boolean')) {
      return 'Boolean';
    }
    if (type.includes('timestamp')) {
      return 'DateTime';
    }
    if (type.includes('date')) {
      return 'DateTime @db.Date';
    }
    if (type.includes('json')) {
      return 'Json';
    }
    
    // Default to String for unknown types
    return 'String';
  }

  /**
   * Generate Prisma field definition
   */
  generatePrismaField(column) {
    const fieldName = this.convertToCamelCase(column.name);
    const fieldType = this.convertSqlTypeToPrisma(column.type);
    
    let field = `  ${fieldName}`;
    
    // Add type
    if (fieldType === 'Decimal' && column.type.includes('(')) {
      // Extract precision and scale for Decimal
      const match = column.type.match(/decimal\((\d+),(\d+)\)/i);
      if (match) {
        field += ` Decimal @db.Decimal(${match[1]}, ${match[2]})`;
      } else {
        field += ` Decimal`;
      }
    } else {
      field += ` ${fieldType}`;
    }
    
    // Add modifiers
    if (column.name === 'id' || column.name.endsWith('_id')) {
      field += ` @id`;
    }
    if (column.name === 'created_at') {
      field += ` @default(now())`;
    }
    if (column.name === 'updated_at') {
      field += ` @updatedAt`;
    }
    if (column.defaultValue && column.defaultValue !== 'NULL') {
      field += ` @default(${column.defaultValue})`;
    }
    if (column.name.includes('_at') && column.name !== 'created_at' && column.name !== 'updated_at') {
      field += ` @default(now())`;
    }
    
    // Add field mapping
    if (column.name !== fieldName) {
      field += ` @map("${column.name}")`;
    }
    
    return field;
  }

  /**
   * Convert snake_case to camelCase
   */
  convertToCamelCase(str) {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  /**
   * Generate model name from table name
   */
  generateModelName(tableName) {
    return tableName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Generate complete Prisma model
   */
  generatePrismaModel(tableInfo) {
    const modelName = this.generateModelName(tableInfo.tableName);
    let model = '';
    
    // Add header comment
    model += `\n// =====================================================\n`;
    model += `// ${tableInfo.schema.toUpperCase()} SCHEMA - ${tableInfo.tableName.toUpperCase()}\n`;
    model += `// =====================================================\n\n`;
    
    model += `model ${modelName} {\n`;
    
    // Add fields
    for (const column of tableInfo.columns) {
      model += this.generatePrismaField(column) + '\n';
    }
    
    // Add table mapping
    model += `\n  @@map("${tableInfo.fullTableName}")\n`;
    model += `}\n`;
    
    return model;
  }

  /**
   * Generate all missing Prisma models
   */
  generateAllModels() {
    console.log('📝 Generating Prisma models...');
    
    let allModels = '';
    
    // Group tables by schema
    const schemas = new Map();
    for (const [fullTableName, tableInfo] of this.sqlTables) {
      if (!schemas.has(tableInfo.schema)) {
        schemas.set(tableInfo.schema, []);
      }
      schemas.get(tableInfo.schema).push(tableInfo);
    }
    
    // Generate models for each schema
    for (const [schema, tables] of schemas) {
      allModels += `\n// =====================================================\n`;
      allModels += `// ${schema.toUpperCase()} SCHEMA\n`;
      allModels += `// =====================================================\n`;
      
      for (const table of tables) {
        allModels += this.generatePrismaModel(table);
      }
    }
    
    return allModels;
  }

  /**
   * Run the generator
   */
  async run() {
    try {
      console.log('🚀 Starting Prisma Model Generation...\n');
      
      this.parseSqlSchema();
      const models = this.generateAllModels();
      
      // Save to file
      const outputPath = path.join(__dirname, 'generated-prisma-models.prisma');
      fs.writeFileSync(outputPath, models);
      
      console.log(`✅ Generated ${this.sqlTables.size} Prisma models`);
      console.log(`📄 Models saved to: ${outputPath}`);
      
      // Show sample of generated models
      console.log('\n📋 Sample of generated models:');
      const lines = models.split('\n').slice(0, 50);
      console.log(lines.join('\n'));
      
    } catch (error) {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    }
  }
}

// Run the generator
if (require.main === module) {
  const generator = new PrismaModelGenerator();
  generator.run();
}

module.exports = PrismaModelGenerator;
