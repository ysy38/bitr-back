const fs = require('fs');
const path = require('path');

// Since the logo is AVIF masquerading as PNG, we'll just use it as-is
// The browser will render it correctly
const logoPath = path.join(__dirname, '../public/logo.png');
const outputPath = path.join(__dirname, '../public/logo-converted.png');

console.log('Checking logo...');
const stats = fs.statSync(logoPath);
console.log('Logo size:', stats.size);

// Read the file
const buffer = fs.readFileSync(logoPath);
const header = buffer.slice(0, 12).toString('hex');
console.log('File header:', header);

// Copy to new location for now (Playwright should handle AVIF)
fs.copyFileSync(logoPath, outputPath);
console.log('Logo ready at:', outputPath);

