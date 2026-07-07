import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  /**
   * Generates a PDF buffer from an HTML string.
   *
   * PRODUCTION NOTE: In production, this should use puppeteer or a similar
   * headless browser library to render the HTML into a proper PDF:
   *
   *   const browser = await puppeteer.launch();
   *   const page = await browser.newPage();
   *   await page.setContent(html, { waitUntil: 'networkidle0' });
   *   const pdf = await page.pdf({ format: 'Letter', printBackground: true });
   *   await browser.close();
   *   return pdf;
   *
   * The current implementation returns the HTML as a buffer to avoid
   * requiring Chromium in dev/test environments.
   */
  async generateFromHtml(html: string): Promise<Buffer> {
    this.logger.log('Generating PDF from HTML (mock: returning HTML as buffer)');
    return Buffer.from(html, 'utf-8');
  }
}
