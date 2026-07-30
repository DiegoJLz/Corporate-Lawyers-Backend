import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Prisma, SignatureStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { StorageService } from '../../../services/storage/storage.service';
import { AuditService } from '../../../services/audit/audit.service';
import { NotificationService } from '../../../services/notification/notification.service';
import { ISignatureProvider } from './providers/signature-provider.interface';
import { CreateSignatureRequestDto } from './dto/create-signature-request.dto';
import { SignatureQueryDto } from './dto/signature-query.dto';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { CircuitBreaker } from '../../../common/resilience/circuit-breaker';

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);
  private circuitBreaker = new CircuitBreaker('signature', { failureThreshold: 5, recoveryTimeoutMs: 60000 });

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    @Inject('SIGNATURE_PROVIDER')
    private readonly signatureProvider: ISignatureProvider,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  // ─── Create Request ─────────────────────────────────────────

  async createRequest(dto: CreateSignatureRequestDto, userId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: dto.documentId, deletedAt: null },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(
        `Document with ID ${dto.documentId} not found`,
      );
    }

    const presignedUrl = await this.storageService.getPresignedUrl(
      document.fileUrl,
      3600,
    );

    const apiUrl = this.configService.get<string>(
      'API_URL',
      'http://localhost:3000',
    );
    const callbackUrl = `${apiUrl}/api/v1/webhooks/signatures`;

    const result = await this.circuitBreaker.execute(() =>
      this.signatureProvider.createRequest({
        documentTitle: document.title,
        documentUrl: presignedUrl,
        signers: dto.signers.map((s) => ({
          name: s.name,
          email: s.email,
          order: s.order,
        })),
        callbackUrl,
        message: dto.message,
      }),
    );

    const signatures = await Promise.all(
      dto.signers.map((signer) =>
        this.prisma.documentSignature.create({
          data: {
            documentId: dto.documentId,
            signerName: signer.name,
            signerEmail: signer.email,
            status: SignatureStatus.PENDING,
            signatureProvider: 'docusign',
            externalId: result.externalId,
          },
        }),
      ),
    );

    // Send notification email to each signer
    for (const signer of dto.signers) {
      // Find if signer is a user in the system
      const signerUser = await this.prisma.user.findFirst({
        where: { email: signer.email },
      });

      if (signerUser) {
        await this.notificationService.send({
          userId: signerUser.id,
          type: NotificationType.EMAIL,
          title: 'Signature Requested',
          body: `You have been requested to sign the document "${document.title}". ${dto.message ?? ''}`.trim(),
          data: {
            documentId: dto.documentId,
            signingUrl: result.signingUrl,
          },
        });
      }
    }

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entityType: 'DocumentSignature',
      entityId: dto.documentId,
      newValue: {
        signers: dto.signers.map((s) => s.email),
        externalId: result.externalId,
      },
    });

    this.logger.log(
      `Signature request created for document ${dto.documentId} with ${dto.signers.length} signer(s)`,
    );

    return {
      externalId: result.externalId,
      signingUrl: result.signingUrl,
      signatures,
    };
  }

  // ─── Resend Request ─────────────────────────────────────────

  async resendRequest(signatureId: string, userId: string) {
    const signature = await this.prisma.documentSignature.findUnique({
      where: { id: signatureId },
      include: {
        document: {
          select: { id: true, title: true },
        },
      },
    });

    if (!signature) {
      throw new NotFoundException(`Signature with ID ${signatureId} not found`);
    }

    if (signature.status !== SignatureStatus.PENDING) {
      throw new BadRequestException(
        `Cannot resend notification for signature with status: ${signature.status}. Only PENDING signatures can be resent.`,
      );
    }

    // Find if signer is a user in the system
    const signerUser = await this.prisma.user.findFirst({
      where: { email: signature.signerEmail },
    });

    if (signerUser) {
      await this.notificationService.send({
        userId: signerUser.id,
        type: NotificationType.EMAIL,
        title: 'Signature Reminder',
        body: `Reminder: You have a pending signature request for the document "${signature.document.title}".`,
        data: {
          documentId: signature.documentId,
          signatureId: signature.id,
        },
      });
    }

    await this.auditService.log({
      userId,
      action: 'RESEND_SIGNATURE',
      entityType: 'DocumentSignature',
      entityId: signatureId,
      newValue: { signerEmail: signature.signerEmail },
    });

    this.logger.log(
      `Signature request resent for signature ${signatureId} to ${signature.signerEmail}`,
    );

    return { message: 'Signature notification resent successfully' };
  }

  // ─── Cancel Request ────────────────────────────────────────

  async cancelRequest(signatureId: string, userId: string) {
    const signature = await this.prisma.documentSignature.findUnique({
      where: { id: signatureId },
      include: {
        document: {
          select: { id: true, title: true },
        },
      },
    });

    if (!signature) {
      throw new NotFoundException(`Signature with ID ${signatureId} not found`);
    }

    if (signature.status !== SignatureStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel signature with status: ${signature.status}. Only PENDING signatures can be cancelled.`,
      );
    }

    await this.prisma.documentSignature.update({
      where: { id: signatureId },
      data: { status: SignatureStatus.EXPIRED },
    });

    await this.auditService.log({
      userId,
      action: 'CANCEL_SIGNATURE',
      entityType: 'DocumentSignature',
      entityId: signatureId,
      newValue: { previousStatus: 'PENDING', newStatus: 'EXPIRED' },
    });

    this.logger.log(
      `Signature request ${signatureId} cancelled by user ${userId}`,
    );

    return { message: 'Signature request cancelled successfully' };
  }

  // ─── Find All ───────────────────────────────────────────────

  async findAll(query: SignatureQueryDto) {
    const where: Prisma.DocumentSignatureWhereInput = {};

    if (query.documentId) where.documentId = query.documentId;
    if (query.status) where.status = query.status;

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.documentSignature.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              fileName: true,
              caseDocuments: {
                include: {
                  case: { select: { id: true, caseNumber: true } },
                },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.documentSignature.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasNextPage: offset + limit < total,
        hasPreviousPage: offset > 0,
      },
    };
  }

  // ─── Find One ───────────────────────────────────────────────

  async findOne(id: string) {
    const signature = await this.prisma.documentSignature.findUnique({
      where: { id },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            fileUrl: true,
            uploadedById: true,
          },
        },
      },
    });

    if (!signature) {
      throw new NotFoundException(`Signature with ID ${id} not found`);
    }

    return signature;
  }

  // ─── Get Document Signatures ────────────────────────────────

  async getDocumentSignatures(documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException(
        `Document with ID ${documentId} not found`,
      );
    }

    return this.prisma.documentSignature.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Handle Webhook ─────────────────────────────────────────

  async handleWebhook(payload: Record<string, any>) {
    const externalId = payload.externalId ?? payload.envelopeId;
    const eventStatus = payload.status ?? payload.event;

    if (!externalId) {
      this.logger.warn('Webhook payload missing externalId');
      return;
    }

    const signatures = await this.prisma.documentSignature.findMany({
      where: { externalId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileUrl: true,
            currentVersion: true,
            uploadedById: true,
          },
        },
      },
    });

    if (signatures.length === 0) {
      this.logger.warn(
        `No signatures found for externalId: ${externalId}`,
      );
      return;
    }

    // Map webhook status to internal status
    let newStatus: SignatureStatus;
    switch (eventStatus) {
      case 'completed':
      case 'signed':
        newStatus = SignatureStatus.SIGNED;
        break;
      case 'declined':
        newStatus = SignatureStatus.DECLINED;
        break;
      case 'expired':
      case 'voided':
        newStatus = SignatureStatus.EXPIRED;
        break;
      default:
        newStatus = SignatureStatus.PENDING;
    }

    // Update all signatures with this externalId
    await this.prisma.documentSignature.updateMany({
      where: { externalId },
      data: {
        status: newStatus,
        ...(newStatus === SignatureStatus.SIGNED
          ? { signedAt: new Date() }
          : {}),
      },
    });

    this.logger.log(
      `Updated ${signatures.length} signature(s) for externalId ${externalId} to status ${newStatus}`,
    );

    // If signed: download signed document, upload as new version
    if (newStatus === SignatureStatus.SIGNED) {
      const document = signatures[0].document;

      try {
        const signedBuffer =
          await this.signatureProvider.downloadSigned(externalId);

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const key = `documents/${year}/${month}/${uuidv4()}-signed.pdf`;

        await this.storageService.upload(
          {
            fieldname: 'file',
            encoding: '7bit',
            buffer: signedBuffer,
            originalname: `${document.title}-signed.pdf`,
            mimetype: 'application/pdf',
            size: signedBuffer.length,
          },
          key,
        );

        const newVersionNumber = document.currentVersion + 1;

        await this.prisma.documentVersion.create({
          data: {
            documentId: document.id,
            versionNumber: newVersionNumber,
            fileUrl: key,
            fileSize: signedBuffer.length,
            changeDescription: 'Digitally signed document',
            createdById: document.uploadedById,
          },
        });

        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            currentVersion: newVersionNumber,
            fileUrl: key,
            fileSize: signedBuffer.length,
            fileName: `${document.title}-signed.pdf`,
            mimeType: 'application/pdf',
          },
        });

        this.logger.log(
          `Signed document uploaded as version ${newVersionNumber} for document ${document.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to download/upload signed document for ${externalId}: ${error}`,
          (error as Error).stack,
        );
      }

      // Notify the document uploader
      await this.notificationService.send({
        userId: document.uploadedById,
        type: NotificationType.IN_APP,
        title: 'Document Signed',
        body: `The document "${document.title}" has been signed.`,
        data: { documentId: document.id, externalId },
      });

      for (const signature of signatures) {
        await this.webhookDispatcher.dispatch('document.signed', { documentId: signature.documentId, signatureId: signature.id, signerEmail: signature.signerEmail });
      }
    }
  }
}
