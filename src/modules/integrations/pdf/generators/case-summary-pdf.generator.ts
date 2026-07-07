import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { PdfService } from '../pdf.service';
import { TemplateService } from '../../email/templates/template.service';
import { StorageService } from '../../../../services/storage/storage.service';
import { AuditService } from '../../../../services/audit/audit.service';

@Injectable()
export class CaseSummaryPdfGenerator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly templateService: TemplateService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async generate(caseId: string, userId: string): Promise<{ pdfUrl: string; buffer: Buffer }> {
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId },
      include: {
        clientProfile: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        assignments: {
          where: { removedAt: null },
          include: { user: { select: { firstName: true, lastName: true, role: true } } },
        },
        parties: true,
        notes: { where: { isInternal: false }, orderBy: { createdAt: 'desc' }, take: 20 },
        timeline: { where: { isPublic: true }, orderBy: { createdAt: 'desc' }, take: 50 },
        _count: { select: { caseDocuments: true, invoices: true, tasks: true } },
      },
    });

    if (!caseData) throw new NotFoundException('Case not found');

    const html = `
    <html>
    <head><style>
      body { font-family: Arial, sans-serif; color: #333; margin: 20px; }
      h1 { color: #1a365d; border-bottom: 2px solid #c9a84c; padding-bottom: 10px; }
      h2 { color: #1a365d; margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { padding: 8px; border: 1px solid #e2e8f0; text-align: left; }
      th { background: #1a365d; color: white; }
      .meta { color: #666; font-size: 14px; }
      .status { font-weight: bold; color: #2b6cb0; }
    </style></head>
    <body>
      <h1>${caseData.caseNumber} — ${caseData.title}</h1>
      <p class="meta">Generated: ${new Date().toLocaleDateString('es-MX')} | Status: <span class="status">${caseData.status}</span></p>
      <p class="meta">Type: ${caseData.type} | Priority: ${caseData.priority} | Area: ${caseData.legalArea || 'N/A'}</p>
      ${caseData.court ? `<p class="meta">Court: ${caseData.court} | File: ${caseData.courtFileNumber || 'N/A'}</p>` : ''}
      ${caseData.description ? `<p>${caseData.description}</p>` : ''}

      <h2>Client</h2>
      <p>${caseData.clientProfile.user.firstName} ${caseData.clientProfile.user.lastName} (${caseData.clientProfile.user.email})</p>

      <h2>Legal Team</h2>
      <table><tr><th>Name</th><th>Role</th></tr>
      ${caseData.assignments.map(a => `<tr><td>${a.user.firstName} ${a.user.lastName}</td><td>${a.role}</td></tr>`).join('')}
      </table>

      <h2>Parties</h2>
      <table><tr><th>Name</th><th>Role</th><th>Contact</th></tr>
      ${caseData.parties.map(p => `<tr><td>${p.name}</td><td>${p.role}</td><td>${p.email || p.phone || 'N/A'}</td></tr>`).join('')}
      </table>

      <h2>Timeline (Public)</h2>
      <table><tr><th>Date</th><th>Event</th><th>Description</th></tr>
      ${caseData.timeline.map(t => `<tr><td>${t.createdAt.toLocaleDateString('es-MX')}</td><td>${t.eventType}</td><td>${t.title}</td></tr>`).join('')}
      </table>

      <h2>Statistics</h2>
      <p>Documents: ${caseData._count.caseDocuments} | Invoices: ${caseData._count.invoices} | Tasks: ${caseData._count.tasks}</p>

      <hr><p style="color: #999; font-size: 12px;">${process.env.FIRM_NAME || 'Corporate Lawyers S.C.'} — Confidential</p>
    </body></html>`;

    const buffer = await this.pdfService.generateFromHtml(html);

    const key = `cases/${new Date().getFullYear()}/${caseData.caseNumber}-summary.pdf`;
    const pdfUrl = await this.storageService.upload({
      fieldname: 'file',
      encoding: '7bit',
      buffer,
      originalname: `${caseData.caseNumber}-summary.pdf`,
      mimetype: 'application/pdf',
      size: buffer.length,
    }, key);

    await this.auditService.log({
      userId,
      action: 'GENERATE_SUMMARY_PDF',
      entityType: 'Case',
      entityId: caseId,
    });

    return { pdfUrl, buffer };
  }
}
