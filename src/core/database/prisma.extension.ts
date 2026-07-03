import { Prisma } from '@prisma/client';

export const SOFT_DELETE_MODELS = [
  'User',
  'Case',
  'CaseNote',
  'Document',
  'TimeEntry',
  'Expense',
  'Invoice',
  'Event',
] as const;

type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel);
}

export function softDeleteExtension() {
  return Prisma.defineExtension({
    name: 'softDelete',
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },

        async findFirst({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },

        async findFirstOrThrow({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },

        async findUnique({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            // findUnique doesn't support arbitrary where filters,
            // so we add deletedAt check and the result is filtered post-query
            const result = await query(args);
            if (result && (result as any).deletedAt !== null) {
              return null;
            }
          }
          return query(args);
        },

        async findUniqueOrThrow({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const result = await query(args);
            if ((result as any).deletedAt !== null) {
              throw new Prisma.PrismaClientKnownRequestError('Record not found (soft deleted)', {
                code: 'P2025',
                clientVersion: Prisma.prismaVersion.client,
              });
            }
            return result;
          }
          return query(args);
        },

        async count({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },

        async delete({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            // Convert hard delete to soft delete (update with deletedAt)
            const { where } = args as any;
            return (this as any)[model].update({
              where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },

        async deleteMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const { where } = args as any;
            return (this as any)[model].updateMany({
              where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
      },
    },
  });
}
