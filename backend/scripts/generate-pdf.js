const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class PDFGenerator {
  constructor() {
    this.template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitredict MVP Specification</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
            position: relative;
        }
        
        .logo {
            width: 80px;
            height: 80px;
            background: white;
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 300;
        }
        
        .header .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .content {
            padding: 40px;
        }
        
        h1 {
            color: #667eea;
            font-size: 2.2em;
            margin: 30px 0 20px 0;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        
        h2 {
            color: #764ba2;
            font-size: 1.8em;
            margin: 25px 0 15px 0;
            border-left: 4px solid #764ba2;
            padding-left: 15px;
        }
        
        h3 {
            color: #5a67d8;
            font-size: 1.4em;
            margin: 20px 0 10px 0;
        }
        
        h4 {
            color: #4c51bf;
            font-size: 1.2em;
            margin: 15px 0 8px 0;
        }
        
        p {
            margin-bottom: 15px;
            text-align: justify;
        }
        
        ul, ol {
            margin: 15px 0;
            padding-left: 30px;
        }
        
        li {
            margin-bottom: 8px;
        }
        
        .user-story {
            background: #f7fafc;
            border-left: 4px solid #4299e1;
            padding: 15px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .user-story strong {
            color: #2b6cb0;
            display: block;
            margin-bottom: 8px;
        }
        
        .technical-requirements {
            background: #f0fff4;
            border-left: 4px solid #38a169;
            padding: 15px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .technical-requirements strong {
            color: #2f855a;
            display: block;
            margin-bottom: 8px;
        }
        
        .functionality {
            background: #fffaf0;
            border-left: 4px solid #ed8936;
            padding: 15px;
            margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .functionality strong {
            color: #c05621;
            display: block;
            margin-bottom: 8px;
        }
        
        code {
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            color: #e53e3e;
        }
        
        pre {
            background: #2d3748;
            color: #e2e8f0;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 15px 0;
        }
        
        pre code {
            background: none;
            color: inherit;
            padding: 0;
        }
        
        .contract-function {
            background: #edf2f7;
            border: 1px solid #cbd5e0;
            border-radius: 6px;
            padding: 12px;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
        }
        
        .contract-function strong {
            color: #2d3748;
        }
        
        .highlight {
            background: linear-gradient(120deg, #a8edea 0%, #fed6e3 100%);
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border: 1px solid #e2e8f0;
        }
        
        .footer {
            background: #2d3748;
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .footer p {
            margin: 5px 0;
            opacity: 0.8;
        }
        
        @media print {
            body {
                background: white;
            }
            
            .container {
                box-shadow: none;
            }
            
            .header {
                background: #667eea !important;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">B</div>
            <h1>Bitredict</h1>
            <div class="subtitle">MVP Specification Document</div>
        </div>
        
        <div class="content">
            {{CONTENT}}
        </div>
        
        <div class="footer">
            <p><strong>Bitredict Platform</strong></p>
            <p>Decentralized Prediction Markets on Somnia Blockchain</p>
            <p>Generated on {{DATE}}</p>
        </div>
    </div>
</body>
</html>`;
  }

  async generatePDF(markdownFile, outputFile) {
    try {
      console.log('📄 Reading Markdown file...');
      const markdownContent = fs.readFileSync(markdownFile, 'utf8');
      
      console.log('🔄 Converting Markdown to HTML...');
      const { marked } = await import('marked');
      const htmlContent = marked(markdownContent);
      
      console.log('🎨 Applying styling...');
      const styledHTML = this.template
        .replace('{{CONTENT}}', htmlContent)
        .replace('{{DATE}}', new Date().toLocaleDateString());
      
      console.log('🌐 Launching browser...');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(styledHTML, { waitUntil: 'networkidle0' });
      
      console.log('📄 Generating PDF...');
      const pdf = await page.pdf({
        path: outputFile,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      
      await browser.close();
      
      console.log(`✅ PDF generated successfully: ${outputFile}`);
      return outputFile;
      
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new PDFGenerator();
  
  const markdownFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.md';
  const outputFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.pdf';
  
  try {
    await generator.generatePDF(markdownFile, outputFile);
    console.log('🎉 PDF generation completed successfully!');
  } catch (error) {
    console.error('💥 PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PDFGenerator;
