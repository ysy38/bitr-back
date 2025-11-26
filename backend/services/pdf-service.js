/**
 * PDF Service
 * 
 * Professional PDF generation service using Playwright for HTML/CSS to PDF conversion.
 * Supports pitch decks, one-pagers, infographics, and custom templates.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

class PDFService {
  constructor() {
    this.browser = null;
    this.templatesPath = path.join(__dirname, '../templates/pdf');
    this.outputPath = path.join(__dirname, '../public/pdf-output');
    this.initialized = false;
  }

  /**
   * Initialize the PDF service (launch browser)
   */
  async initialize() {
    if (this.initialized && this.browser) {
      return;
    }

    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputPath, { recursive: true });

      // Launch browser (headless mode for production)
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // For Docker/production environments
      });

      this.initialized = true;
      console.log('✅ PDF Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize PDF Service:', error);
      throw error;
    }
  }

  /**
   * Generate PDF from HTML template
   * @param {string} templateName - Name of the template file (without .html extension)
   * @param {Object} data - Data to inject into the template
   * @param {Object} options - PDF generation options
   * @returns {Buffer} PDF buffer
   */
  async generatePDF(templateName, data = {}, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const page = await this.browser.newPage();

    try {
      // Load template
      const templatePath = path.join(this.templatesPath, `${templateName}.html`);
      let html = await fs.readFile(templatePath, 'utf-8');

      // Merge data with logo data
      const mergedData = { ...data };
      const logoData = this.getLogoData();
      if (logoData) {
        mergedData.logoBase64 = `data:${logoData.mimeType};base64,${logoData.base64}`;
      }

      // Inject data into template
      html = this.injectData(html, mergedData);

      // Set content
      await page.setContent(html, { waitUntil: 'networkidle' });

      // Generate PDF with options
      const pdfOptions = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: options.printBackground !== false,
        margin: options.margin || {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        },
        preferCSSPageSize: options.preferCSSPageSize !== false, // Default to true to respect CSS @page rules
        ...options
      };

      const pdfBuffer = await page.pdf(pdfOptions);

      return pdfBuffer;
    } catch (error) {
      console.error(`Error generating PDF from template ${templateName}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate PDF from custom HTML string
   * @param {string} html - HTML content
   * @param {Object} options - PDF generation options
   * @returns {Buffer} PDF buffer
   */
  async generatePDFFromHTML(html, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const page = await this.browser.newPage();

    try {
      // If HTML string contains placeholders, inject logo as well
      const logoData = this.getLogoData();
      if (logoData && html.includes('{{logoBase64}}')) {
        html = html.replace(/{{\s*logoBase64\s*}}/g, `data:${logoData.mimeType};base64,${logoData.base64}`);
      }

      await page.setContent(html, { waitUntil: 'networkidle' });

      const pdfOptions = {
        format: options.format || 'A4',
        printBackground: options.printBackground !== false,
        margin: options.margin || {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        },
        ...options
      };

      const pdfBuffer = await page.pdf(pdfOptions);

      return pdfBuffer;
    } catch (error) {
      console.error('Error generating PDF from HTML:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Get logo as base64 data URI with mime type
   * Supports PNG, AVIF, and other image formats
   */
  getLogoData() {
    try {
      const publicDir = path.join(__dirname, '../public');
      let logoPath = null;
      let mimeType = 'image/png';
      
      // Try different logo file names (prioritize transparent PNG)
      const possibleNames = [
        'logo-transparent.png',  // First priority - transparent PNG
        'logo.jpeg', 'logo.jpg', 
        'pdf-output/logo.jpeg.jpeg',
        'logo.png', 'logo.avif', 'logo.svg'
      ];
      
      for (const name of possibleNames) {
        const testPath = path.join(publicDir, name);
        if (fsSync.existsSync(testPath)) {
          logoPath = testPath;
          console.log('✅ Found logo at:', logoPath);
          break;
        }
      }
      
      // If not found, search for any file with 'logo' in the name
      if (!logoPath) {
        try {
          const files = fsSync.readdirSync(publicDir);
          const logoFile = files.find(f => f.toLowerCase().includes('logo') && !f.includes('.js'));
          if (logoFile) {
            logoPath = path.join(publicDir, logoFile);
            console.log('✅ Found logo via search:', logoPath);
          }
        } catch (e) {
          // Directory might not exist
        }
      }
      
      if (logoPath && fsSync.existsSync(logoPath)) {
        const logoBuffer = fsSync.readFileSync(logoPath);
        const ext = path.extname(logoPath).toLowerCase();
        
        // Determine mime type
        if (ext === '.png') {
          mimeType = 'image/png';
        } else if (ext === '.avif') {
          mimeType = 'image/avif';
        } else if (ext === '.jpg' || ext === '.jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === '.svg') {
          mimeType = 'image/svg+xml';
        } else {
          // Try to detect from file content
          const header = logoBuffer.slice(0, 4).toString('hex');
          if (header.startsWith('89504e47')) {
            mimeType = 'image/png';
          } else if (header.startsWith('ffd8ff')) {
            mimeType = 'image/jpeg';
          }
        }
        
        console.log('✅ Logo loaded:', mimeType, logoBuffer.length, 'bytes');
        return {
          base64: logoBuffer.toString('base64'),
          mimeType: mimeType
        };
      } else {
        console.warn('⚠️ Logo not found');
      }
    } catch (error) {
      console.warn('Could not load logo:', error.message);
    }
    return null;
  }

  /**
   * Inject data into HTML template using simple placeholder replacement
   * @param {string} html - HTML template
   * @param {Object} data - Data object
   * @returns {string} HTML with injected data
   */
  injectData(html, data) {
    let result = html;

    // Replace {{variable}} placeholders
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, this.escapeHtml(String(value)));
    }

    // Handle nested objects (e.g., {{user.name}})
    const nestedRegex = /{{\s*(\w+(?:\.\w+)+)\s*}}/g;
    result = result.replace(nestedRegex, (match, path) => {
      const value = this.getNestedValue(data, path);
      return value !== undefined ? this.escapeHtml(String(value)) : match;
    });

    // Handle arrays/loops (simple implementation)
    // Format: {{#each items}}...{{/each}}
    const eachRegex = /{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g;
    result = result.replace(eachRegex, (match, arrayKey, template) => {
      const array = data[arrayKey];
      if (!Array.isArray(array)) return '';
      
      return array.map((item, index) => {
        let itemHtml = template;
        // Handle both object items and string items
        if (typeof item === 'string') {
          // If item is a string, replace {{this}} with the string
          itemHtml = itemHtml.replace(/\{\{this\}\}/g, this.escapeHtml(item));
        } else {
          // If item is an object, replace properties
          for (const [key, value] of Object.entries(item)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            itemHtml = itemHtml.replace(regex, this.escapeHtml(String(value)));
          }
        }
        return itemHtml;
      }).join('');
    });

    // Handle conditional blocks {{#if variable}}...{{/if}}
    const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    result = result.replace(ifRegex, (match, varKey, content) => {
      const value = data[varKey];
      if (value && value !== '' && value !== null && value !== undefined) {
        return content;
      }
      return '';
    });

    return result;
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Save PDF to file
   * @param {Buffer} pdfBuffer - PDF buffer
   * @param {string} filename - Output filename
   * @returns {string} Path to saved file
   */
  async savePDF(pdfBuffer, filename) {
    const filePath = path.join(this.outputPath, filename);
    await fs.writeFile(filePath, pdfBuffer);
    return filePath;
  }

  /**
   * Cleanup - close browser
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.initialized = false;
    }
  }

  /**
   * Get available templates
   */
  async getAvailableTemplates() {
    try {
      const files = await fs.readdir(this.templatesPath);
      return files
        .filter(file => file.endsWith('.html'))
        .map(file => file.replace('.html', ''));
    } catch (error) {
      console.error('Error reading templates directory:', error);
      return [];
    }
  }
}

// Singleton instance
let pdfServiceInstance = null;

function getPDFService() {
  if (!pdfServiceInstance) {
    pdfServiceInstance = new PDFService();
  }
  return pdfServiceInstance;
}

module.exports = getPDFService;

