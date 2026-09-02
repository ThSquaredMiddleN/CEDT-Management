import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** The transaction-scoped client type used across the service layer. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
