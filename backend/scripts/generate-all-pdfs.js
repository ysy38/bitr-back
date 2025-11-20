#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AllPDFGenerator {
  constructor() {
    this.scripts = [
      { name: 'Basic', script: 'generate-pdf.js', output: 'Bitredict_MVP_Specification_Basic.pdf' },
      { name: 'Advanced', script: 'generate-advanced-pdf.js', output: 'Bitredict_MVP_Specification_Advanced.pdf' },
      { name: 'With Logo', script: 'generate-logo-pdf.js', output: 'Bitredict_MVP_Specification_WithLogo.pdf' },
      { name: 'Premium', script: 'generate-premium-pdf.js', output: 'Bitredict_MVP_Specification_Premium.pdf' }
    ];
  }

  async generateAll() {
    console.log('🎨 Bitredict PDF Generator - All Versions');
    console.log('==========================================\n');

    const results = [];

    for (const { name, script, output } of this.scripts) {
      try {
        console.log(`📄 Generating ${name} PDF...`);
        const startTime = Date.now();
        
        execSync(`node scripts/${script}`, { 
          stdio: 'inherit',
          cwd: '/home/leon/bitredict-linux/backend'
        });
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        const outputPath = `/home/leon/bitredict-linux/${output}`;
        const stats = fs.statSync(outputPath);
        const fileSize = (stats.size / 1024).toFixed(1);
        
        results.push({
          name,
          status: '✅ Success',
          duration: `${duration}s`,
          size: `${fileSize} KB`,
          path: outputPath
        });
        
        console.log(`✅ ${name} PDF generated successfully (${duration}s, ${fileSize} KB)\n`);
        
      } catch (error) {
        results.push({
          name,
          status: '❌ Failed',
          duration: 'N/A',
          size: 'N/A',
          path: 'N/A',
          error: error.message
        });
        
        console.log(`❌ ${name} PDF generation failed: ${error.message}\n`);
      }
    }

    // Summary
    console.log('📊 Generation Summary');
    console.log('====================');
    results.forEach(result => {
      console.log(`${result.status} ${result.name.padEnd(12)} ${result.duration.padEnd(8)} ${result.size.padEnd(10)} ${result.path}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });

    const successCount = results.filter(r => r.status.includes('✅')).length;
    const totalCount = results.length;
    
    console.log(`\n🎉 Generated ${successCount}/${totalCount} PDFs successfully!`);
    
    if (successCount > 0) {
      console.log('\n📁 Generated PDFs:');
      results.filter(r => r.status.includes('✅')).forEach(result => {
        console.log(`   • ${result.name}: ${result.path}`);
      });
    }
  }
}

// Main execution
async function main() {
  const generator = new AllPDFGenerator();
  
  try {
    await generator.generateAll();
  } catch (error) {
    console.error('💥 PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = AllPDFGenerator;
