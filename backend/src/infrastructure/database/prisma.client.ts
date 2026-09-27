import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient({ log: ["warn", "error"] });

// A type for the client or transaction used by repositories
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
