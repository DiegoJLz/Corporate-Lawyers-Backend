import { Prisma } from '@prisma/client';

export const SOFT_DELETE_MODELS = [
  'User',
  'Case',
  'CaseNote',
  'Document',
  'TimeEntry',
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

        async count({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },

        async delete({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            return (query as any)({
              ...args,
              __prismaRawAction: 'update',
              data: { deletedAt: new Date() },
            } as any);
          }
          return query(args);
        },

        async deleteMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            return (query as any)({
              ...args,
              __prismaRawAction: 'updateMany',
              data: { deletedAt: new Date() },
            } as any);
          }
          return query(args);
        },
      },
    },
  });
}
