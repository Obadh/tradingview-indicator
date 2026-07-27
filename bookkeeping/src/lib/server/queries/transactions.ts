import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { isoDateToUtc } from "@/lib/domain/dates";
import type { TransactionRow } from "@/components/transaction-table";

export interface TransactionFilter {
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  missing?: string;
  reviewFlag?: string;
  q?: string;
}

export async function listTransactions(
  businessId: string,
  filter: TransactionFilter,
  take = 200,
): Promise<TransactionRow[]> {
  const where: Prisma.TransactionWhereInput = { businessId };
  if (filter.type) where.type = filter.type as never;
  if (filter.status) where.status = filter.status as never;
  else where.status = { notIn: ["VOID"] };
  if (filter.reviewFlag) where.reviewFlag = filter.reviewFlag as never;
  if (filter.from || filter.to) {
    where.date = {
      ...(filter.from ? { gte: isoDateToUtc(filter.from) } : {}),
      ...(filter.to ? { lte: isoDateToUtc(filter.to) } : {}),
    };
  }
  if (filter.missing === "document") where.documentLinks = { none: {} };
  if (filter.q) {
    where.OR = [
      { description: { contains: filter.q, mode: "insensitive" } },
      { notes: { contains: filter.q, mode: "insensitive" } },
      { invoiceNumber: { contains: filter.q, mode: "insensitive" } },
      { paymentReference: { contains: filter.q, mode: "insensitive" } },
      { contact: { name: { contains: filter.q, mode: "insensitive" } } },
    ];
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take,
    include: {
      contact: { select: { name: true } },
      category: { select: { name: true } },
      documentLinks: { select: { id: true }, take: 1 },
    },
  });
  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    type: t.type,
    status: t.status,
    reviewFlag: t.reviewFlag,
    amountCents: t.amountCents,
    currency: t.currency,
    contactName: t.contact?.name ?? null,
    categoryName: t.category?.name ?? null,
    hasDocuments: t.documentLinks.length > 0,
  }));
}
