import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './prisma.extension';

// Type for the extended client
type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

function createExtendedClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ],
  });

  return client.$extends(softDeleteExtension());
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: ExtendedPrismaClient;

  constructor() {
    this.client = createExtendedClient();
  }

  async onModuleInit(): Promise<void> {
    await (this.client as any).$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await (this.client as any).$disconnect();
    this.logger.log('Database connection closed');
  }

  // Delegate all model accessors to the extended client
  get user() { return this.client.user; }
  get lawyerProfile() { return this.client.lawyerProfile; }
  get clientProfile() { return this.client.clientProfile; }
  get session() { return this.client.session; }
  get passwordResetToken() { return this.client.passwordResetToken; }
  get case() { return this.client.case; }
  get caseAssignment() { return this.client.caseAssignment; }
  get caseParty() { return this.client.caseParty; }
  get caseNote() { return this.client.caseNote; }
  get caseTimeline() { return this.client.caseTimeline; }
  get caseTask() { return this.client.caseTask; }
  get document() { return this.client.document; }
  get caseDocument() { return this.client.caseDocument; }
  get documentVersion() { return this.client.documentVersion; }
  get documentSignature() { return this.client.documentSignature; }
  get timeEntry() { return this.client.timeEntry; }
  get expense() { return this.client.expense; }
  get invoice() { return this.client.invoice; }
  get invoiceItem() { return this.client.invoiceItem; }
  get payment() { return this.client.payment; }
  get event() { return this.client.event; }
  get eventAttendee() { return this.client.eventAttendee; }
  get reminder() { return this.client.reminder; }
  get lead() { return this.client.lead; }
  get intakeForm() { return this.client.intakeForm; }
  get conflictCheck() { return this.client.conflictCheck; }
  get clientMessage() { return this.client.clientMessage; }
  get notification() { return this.client.notification; }
  get auditLog() { return this.client.auditLog; }

  // Expose $transaction for multi-operation atomicity
  $transaction<T>(fn: Parameters<ExtendedPrismaClient['$transaction']>[0]): Promise<T> {
    return (this.client.$transaction as any)(fn);
  }

  // Expose $queryRaw for raw SQL queries
  $queryRaw<T = unknown>(...args: Parameters<PrismaClient['$queryRaw']>): Promise<T> {
    return (this.client as any).$queryRaw(...args);
  }
}
