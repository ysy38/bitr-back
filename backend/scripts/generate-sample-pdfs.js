/**
 * Generate Sample PDFs
 * 
 * Script to generate sample pitch deck and one-pager PDFs
 * for testing and demonstration purposes.
 */

const getPDFService = require('../services/pdf-service');
const fs = require('fs').promises;
const path = require('path');

async function generateSamplePDFs() {
  console.log('🚀 Starting PDF generation...\n');

  const pdfService = getPDFService();
  
  try {
    // Initialize PDF service
    await pdfService.initialize();
    console.log('✅ PDF Service initialized\n');

    // Load sample data
    const pitchDeckDataPath = path.join(__dirname, '../templates/pdf/sample-pitch-deck.json');
    const onePagerDataPath = path.join(__dirname, '../templates/pdf/sample-one-pager.json');

    const pitchDeckData = JSON.parse(await fs.readFile(pitchDeckDataPath, 'utf-8'));
    const onePagerData = JSON.parse(await fs.readFile(onePagerDataPath, 'utf-8'));

    console.log('📄 Generating Pitch Deck PDF...');
    const pitchDeckBuffer = await pdfService.generatePDF('pitch-deck', pitchDeckData, {
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true
    });

    const pitchDeckPath = await pdfService.savePDF(pitchDeckBuffer, 'sample-pitch-deck.pdf');
    console.log(`✅ Pitch Deck saved to: ${pitchDeckPath}\n`);

    console.log('📄 Generating One-Pager PDF...');
    const onePagerBuffer = await pdfService.generatePDF('one-pager', onePagerData, {
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    });

    const onePagerPath = await pdfService.savePDF(onePagerBuffer, 'sample-one-pager.pdf');
    console.log(`✅ One-Pager saved to: ${onePagerPath}\n`);

    console.log('🎉 All PDFs generated successfully!');
    console.log('\n📁 Output files:');
    console.log(`   - ${pitchDeckPath}`);
    console.log(`   - ${onePagerPath}`);

    // Cleanup
    await pdfService.cleanup();
    console.log('\n✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Error generating PDFs:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateSamplePDFs().catch(console.error);
}

module.exports = generateSamplePDFs;

