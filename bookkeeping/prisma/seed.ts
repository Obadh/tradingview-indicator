/**
 * Demo seed data — ALL FICTIONAL — for a Dutch app developer.
 *
 * Creates a demo owner account (demo@example.com / demo-password-123456),
 * a business profile using the reserved KVK test number range, and a
 * realistic set of records: KVK fee paid personally, pre-registration Apple
 * Developer invoice, domain + hosting expenses, OpenAI (EU-service reverse
 * charge) invoice, personal-to-business transfer, App Store payout, client
 * invoice, refund, mixed-use laptop asset, plus VAT periods including a
 * zero-income quarter.
 *
 * Run: pnpm db:seed   (never run against a production database)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createBusinessWithDefaults } from "../src/lib/server/business-setup";
import {
  buildExpenseJournal,
  buildIncomeJournal,
  buildOwnerFlowJournal,
  assertBalanced,
  type JournalLine,
} from "../src/lib/domain/journal";
import { isoDateToUtc } from "../src/lib/domain/dates";

const prisma = new PrismaClient();

const DEMO_PREFIX = "[DEMO] ";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "demo@example.com" } });
  if (existing) {
    console.log("Demo user already exists — skipping seed. (Delete the DB to reseed.)");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: "demo@example.com",
      name: "Demo Developer",
      passwordHash: await bcrypt.hash("demo-password-123456", 12),
    },
  });

  const businessId = await prisma.$transaction(async (tx) =>
    createBusinessWithDefaults(tx, user.id, {
      legalName: "Demo Developer (FICTIONAL DATA)",
      tradeName: "PixelForge Apps [DEMO]",
      // 96999999 falls in the reserved KVK test range — clearly not real.
      kvkNumber: "96999999",
      vatId: "NL000099998B57", // Belastingdienst example/test format
      addressLine1: "Voorbeeldstraat 1",
      postalCode: "1234 AB",
      city: "Amsterdam",
      country: "NL",
      email: "demo@example.com",
      iban: "NL13TEST0123456789", // TEST bank code
      kvkRegisteredOn: "2026-02-01",
      invoicePrefix: "DEMO",
      firstFinancialYear: 2026,
      vatFilingFrequency: "QUARTERLY",
      korStatus: "NOT_ENROLLED",
      accountingBasis: "INVOICE",
      bankUsage: "BOTH",
    }),
  );

  const vatCodes = await prisma.vATCode.findMany({ where: { businessId } });
  const code = (c: string) => vatCodes.find((v) => v.code === c)!.id;
  const categories = await prisma.category.findMany({ where: { businessId } });
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const accounts = await prisma.ledgerAccount.findMany({ where: { businessId } });
  const accountId = new Map(accounts.map((a) => [a.systemKey!, a.id]));

  async function insertTransaction(
    header: {
      type: string;
      status?: string;
      date: string;
      description: string;
      contactName?: string;
      contactKind?: "SUPPLIER" | "CUSTOMER" | "PLATFORM";
      contactCountry?: string;
      categoryName?: string;
      amountCents: number;
      vatAmountCents?: number;
      invoiceNumber?: string;
      currency?: string;
      originalAmountCents?: number;
      exchangeRate?: string;
      exchangeRateSource?: string;
      isPaid?: boolean;
      paidPersonally?: boolean;
      isPreRegistration?: boolean;
      isMixedUse?: boolean;
      businessUseBp?: number;
      vatRecoveryBp?: number;
      mixedUseNote?: string;
      supplierCountry?: string;
      isReverseCharge?: boolean;
      reviewFlag?: string;
      notes?: string;
    },
    lines: JournalLine[],
  ) {
    assertBalanced(lines);
    let contactId: string | null = null;
    if (header.contactName) {
      const found = await prisma.contact.findFirst({
        where: { businessId, name: header.contactName },
      });
      contactId = (
        found ??
        (await prisma.contact.create({
          data: {
            businessId,
            kind: header.contactKind ?? "SUPPLIER",
            name: header.contactName,
            country: header.contactCountry ?? "NL",
          },
        }))
      ).id;
    }
    const txn = await prisma.transaction.create({
      data: {
        businessId,
        type: header.type as never,
        status: (header.status ?? "CONFIRMED") as never,
        reviewFlag: (header.reviewFlag ?? "NONE") as never,
        date: isoDateToUtc(header.date),
        description: DEMO_PREFIX + header.description,
        contactId,
        categoryId: header.categoryName ? cat(header.categoryName) : null,
        currency: header.currency ?? "EUR",
        originalAmountCents: header.originalAmountCents ?? null,
        exchangeRate: header.exchangeRate ?? null,
        exchangeRateSource: header.exchangeRateSource ?? null,
        amountCents: header.amountCents,
        vatAmountCents: header.vatAmountCents ?? 0,
        invoiceNumber: header.invoiceNumber ?? null,
        invoiceDate: isoDateToUtc(header.date),
        isPaid: header.isPaid ?? true,
        paidPersonally: header.paidPersonally ?? false,
        isPreRegistration: header.isPreRegistration ?? false,
        isMixedUse: header.isMixedUse ?? false,
        businessUseBp: header.businessUseBp ?? 10000,
        vatRecoveryBp: header.vatRecoveryBp ?? 10000,
        mixedUseNote: header.mixedUseNote ?? null,
        supplierCountry: header.supplierCountry ?? null,
        isReverseCharge: header.isReverseCharge ?? false,
        notes: header.notes ?? "Fictional demo data",
        finalizedAt: new Date(),
        lines: {
          create: lines.map((l, i) => ({
            ledgerAccountId: accountId.get(l.accountKey as string) ?? l.accountKey,
            description: l.description ?? null,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            vatCodeId: l.vatCodeId ?? null,
            vatBaseCents: l.vatBaseCents ?? null,
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        businessId,
        actorUserId: user.id,
        action: "create",
        entityType: "Transaction",
        entityId: txn.id,
        newValues: { seed: true, description: txn.description },
        reason: "Demo seed data (fictional)",
      },
    });
    return txn;
  }

  // 1. KVK registration fee, paid personally, before there was a business bank account.
  await insertTransaction(
    {
      type: "BUSINESS_EXPENSE",
      date: "2026-02-01",
      description: "KVK registration fee (paid personally)",
      contactName: "Kamer van Koophandel",
      categoryName: "KVK registration",
      amountCents: 8225,
      vatAmountCents: 0,
      paidPersonally: true,
      invoiceNumber: "KVK-DEMO-1",
    },
    buildExpenseJournal({
      items: [{ description: "KVK registration", netCents: 8225, vatCents: 0, vatCodeId: code("OUT-SCOPE"), treatment: "OUTSIDE_SCOPE" }],
      paidFrom: "PERSONAL",
    }),
  );

  // 2. Apple Developer Program — paid BEFORE KVK registration; pre-registration, needs review.
  await insertTransaction(
    {
      type: "BUSINESS_EXPENSE",
      status: "NEEDS_REVIEW",
      date: "2026-01-15",
      description: "Apple Developer Program (pre-registration, foreign VAT)",
      contactName: "Apple Distribution International Ltd",
      contactCountry: "IE",
      categoryName: "Apple Developer Program",
      amountCents: 11979,
      vatAmountCents: 2079,
      paidPersonally: true,
      isPreRegistration: true,
      supplierCountry: "IE",
      reviewFlag: "NEEDS_TAX_REVIEW",
      invoiceNumber: "APL-DEMO-2026-01",
      notes:
        "Fictional demo. Paid before KVK registration from a private card; Irish VAT charged on a consumer account — not recoverable as Dutch input VAT.",
    },
    buildExpenseJournal({
      items: [{ description: "Apple Developer Program membership", netCents: 9900, vatCents: 2079, vatCodeId: code("FOREIGN-VAT"), treatment: "FOREIGN_VAT" }],
      paidFrom: "PERSONAL",
    }),
  );

  // 3. Domain name expense.
  await insertTransaction(
    {
      type: "BUSINESS_EXPENSE",
      date: "2026-02-10",
      description: "Domain pixelforge.example (.nl registration)",
      contactName: "DemoRegistrar BV",
      categoryName: "Domains",
      amountCents: 1210,
      vatAmountCents: 210,
      invoiceNumber: "DR-88231",
    },
    buildExpenseJournal({
      items: [{ description: "Domain registration 1 year", netCents: 1000, vatCents: 210, vatCodeId: code("NL-HIGH") }],
      paidFrom: "BUSINESS_BANK",
    }),
  );

  // 4. Hosting invoice with Dutch VAT.
  await insertTransaction(
    {
      type: "BUSINESS_EXPENSE",
      date: "2026-03-01",
      description: "Hosting March 2026",
      contactName: "DemoHost NL BV",
      categoryName: "Hosting",
      amountCents: 3025,
      vatAmountCents: 525,
      invoiceNumber: "DH-2026-0301",
    },
    buildExpenseJournal({
      items: [{ description: "VPS hosting", netCents: 2500, vatCents: 525, vatCodeId: code("NL-HIGH") }],
      paidFrom: "BUSINESS_BANK",
    }),
  );

  // 5. OpenAI invoice — foreign supplier, USD, EU-service style reverse charge (needs tax review).
  await insertTransaction(
    {
      type: "BUSINESS_EXPENSE",
      status: "NEEDS_REVIEW",
      date: "2026-03-05",
      description: "OpenAI API usage February",
      contactName: "OpenAI (foreign supplier)",
      contactCountry: "US",
      categoryName: "AI tools and APIs",
      amountCents: 4600,
      vatAmountCents: 966,
      currency: "USD",
      originalAmountCents: 5000,
      exchangeRate: "0.92",
      exchangeRateSource: "bank statement",
      supplierCountry: "US",
      isReverseCharge: true,
      reviewFlag: "NEEDS_TAX_REVIEW",
      invoiceNumber: "OAI-DEMO-77",
      notes:
        "Fictional demo. $50.00 at 0.92 = €46.00. Self-assessed VAT booked; the correct treatment for a non-EU digital service needs review with an adviser.",
    },
    buildExpenseJournal({
      items: [{ description: "API usage", netCents: 4600, vatCents: 966, vatCodeId: code("EU-SRV"), treatment: "EU_SERVICE" }],
      paidFrom: "BUSINESS_BANK",
    }),
  );

  // 6. Personal-to-business transfer (owner contribution).
  await insertTransaction(
    {
      type: "OWNER_CONTRIBUTION",
      date: "2026-02-05",
      description: "Private deposit to start the business account",
      amountCents: 100000,
    },
    buildOwnerFlowJournal({ kind: "OWNER_CONTRIBUTION", amountCents: 100000 }),
  );

  // 7. App Store payout (platform income with commission).
  await insertTransaction(
    {
      type: "BUSINESS_INCOME",
      date: "2026-04-05",
      description: "App Store payout March 2026",
      contactName: "Apple App Store",
      contactKind: "PLATFORM",
      contactCountry: "IE",
      amountCents: 42000,
      vatAmountCents: 0,
      categoryName: "App Store payouts",
      notes:
        "Fictional demo. Consumer app sales settled by Apple (platform). Gross €420.00, commission €63.00, net payout €357.00. VAT on consumer sales via Apple is handled by the platform — treatment marked outside scope pending review.",
    },
    buildIncomeJournal({
      items: [{ description: "App sales March", netCents: 42000, vatCents: 0, vatCodeId: code("OUT-SCOPE") }],
      feeCents: 6300,
      receivedInto: "BUSINESS_BANK",
    }),
  );

  // 8. Client invoice (finalized, paid).
  const clientInvoiceTxn = await insertTransaction(
    {
      type: "BUSINESS_INCOME",
      date: "2026-03-15",
      description: "Sales invoice DEMO-2026-0001 — Website for Bakkerij de Krokante Korst",
      contactName: "Bakkerij de Krokante Korst [DEMO]",
      contactKind: "CUSTOMER",
      amountCents: 181500,
      vatAmountCents: 31500,
      invoiceNumber: "DEMO-2026-0001",
    },
    buildIncomeJournal({
      items: [{ description: "Website development", netCents: 150000, vatCents: 31500, vatCodeId: code("NL-HIGH") }],
      receivedInto: "NOT_RECEIVED",
    }),
  );
  const bakkerij = await prisma.contact.findFirst({
    where: { businessId, name: "Bakkerij de Krokante Korst [DEMO]" },
  });
  const invoice = await prisma.invoice.create({
    data: {
      businessId,
      kind: "INVOICE",
      status: "PAID",
      number: "DEMO-2026-0001",
      prefix: "DEMO",
      issueDate: isoDateToUtc("2026-03-15"),
      dueDate: isoDateToUtc("2026-04-14"),
      contactId: bakkerij!.id,
      totalExVatCents: 150000,
      totalVatCents: 31500,
      totalIncVatCents: 181500,
      paymentTermDays: 30,
      transactionId: clientInvoiceTxn.id,
      finalizedAt: new Date(),
      notes: "Fictional demo invoice",
      lines: {
        create: [
          {
            description: "Website development (fixed price)",
            quantity: 1,
            unitPriceExVatCents: 150000,
            vatCodeId: code("NL-HIGH"),
            vatRatePermille: 210,
            lineExVatCents: 150000,
            lineVatCents: 31500,
          },
        ],
      },
    },
  });
  await prisma.invoiceSequence.create({
    data: { businessId, prefix: "DEMO", year: 2026, nextNumber: 2 },
  });

  // 9. Refund paid to a customer.
  await insertTransaction(
    {
      type: "REFUND_PAID",
      date: "2026-04-20",
      description: "Refund: unhappy in-app purchase customer",
      contactName: "Apple App Store",
      amountCents: 599,
      notes: "Fictional demo. Refund processed via the platform; reduces revenue.",
    },
    [
      { accountKey: "revenue", description: "Refund of app sale", debitCents: 599, creditCents: 0, vatCodeId: code("OUT-SCOPE"), vatBaseCents: -599, sortOrder: 0 },
      { accountKey: "bank_business", description: "Refund paid", debitCents: 0, creditCents: 599, sortOrder: 1 },
    ],
  );

  // 10. Mixed-use laptop as an asset (80% business).
  const laptopTxn = await insertTransaction(
    {
      type: "BUSINESS_EXPENSE",
      date: "2026-02-20",
      description: "MacBook Pro 14 (mixed use 80% business)",
      contactName: "DemoStore Electronics",
      categoryName: "Laptop and computer equipment",
      amountCents: 241999,
      vatAmountCents: 41999,
      isMixedUse: true,
      businessUseBp: 8000,
      vatRecoveryBp: 8000,
      mixedUseNote: "Laptop also used privately in the evenings, estimated 80% business use.",
      invoiceNumber: "DS-2026-1443",
    },
    buildExpenseJournal({
      items: [{ description: "MacBook Pro 14", netCents: 200000, vatCents: 41999, vatCodeId: code("NL-HIGH") }],
      paidFrom: "BUSINESS_BANK",
      businessUseBp: 8000,
      vatRecoveryBp: 8000,
      asAsset: true,
    }),
  );
  await prisma.asset.create({
    data: {
      businessId,
      name: DEMO_PREFIX + "MacBook Pro 14",
      category: "Laptop",
      purchaseDate: isoDateToUtc("2026-02-20"),
      inUseDate: isoDateToUtc("2026-02-20"),
      purchasePriceExVatCents: 200000,
      vatCents: 41999,
      businessUseBp: 8000,
      usefulLifeMonths: 60,
      residualValueCents: 20000,
      annualDepreciationCents: 28800, // (200000-20000)*80% / 5 years
      purchaseTransactionId: laptopTxn.id,
      notes: "Fictional demo asset",
    },
  });

  // 11. Bank account lines + one matched transaction.
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { businessId, kind: "BUSINESS" },
  });
  const bankLine = await prisma.bankTransaction.create({
    data: {
      businessId,
      bankAccountId: bankAccount!.id,
      bookingDate: isoDateToUtc("2026-04-01"),
      amountCents: 181500,
      counterpartyName: "Bakkerij de Krokante Korst",
      counterpartyIban: "NL13TEST0987654321",
      description: "Payment invoice DEMO-2026-0001",
      fingerprint: "demo-fingerprint-1",
      state: "MATCHED",
      stateNote: "Matched to invoice DEMO-2026-0001 (exact amount + invoice number)",
    },
  });
  const payment = await prisma.payment.create({
    data: {
      businessId,
      bankAccountId: bankAccount!.id,
      bankTransactionId: bankLine.id,
      date: isoDateToUtc("2026-04-01"),
      amountCents: 181500,
      method: "BANK_TRANSFER",
      reference: "DEMO-2026-0001",
    },
  });
  await prisma.paymentAllocation.create({
    data: {
      businessId,
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountCents: 181500,
    },
  });
  await prisma.reconciliationMatch.create({
    data: {
      businessId,
      bankTransactionId: bankLine.id,
      invoiceId: invoice.id,
      amountCents: 181500,
      reason: "exact amount, invoice number in description",
      confirmedAt: new Date(),
    },
  });
  await prisma.bankTransaction.create({
    data: {
      businessId,
      bankAccountId: bankAccount!.id,
      bookingDate: isoDateToUtc("2026-04-02"),
      amountCents: -3025,
      counterpartyName: "DemoHost NL BV",
      description: "Hosting invoice DH-2026-0301",
      fingerprint: "demo-fingerprint-2",
      state: "UNMATCHED",
    },
  });

  // 12. VAT periods: Q1 2026 (activity, filed+locked would block edits, so leave open),
  //     and a zero-income period Q3 2026.
  await prisma.taxPeriod.createMany({
    data: [
      {
        businessId,
        type: "VAT",
        year: 2026,
        periodNo: 1,
        startDate: isoDateToUtc("2026-01-01"),
        endDate: isoDateToUtc("2026-03-31"),
        status: "READY_FOR_REVIEW",
        notes: "Demo: quarter with activity, ready for review",
      },
      {
        businessId,
        type: "VAT",
        year: 2026,
        periodNo: 3,
        startDate: isoDateToUtc("2026-07-01"),
        endDate: isoDateToUtc("2026-09-30"),
        status: "NOT_PREPARED",
        notes: "Demo: zero-income quarter — a nil return (nihilaangifte) may still be required",
      },
    ],
  });

  // 13. Demo time entries.
  await prisma.timeEntry.createMany({
    data: [
      { businessId, userId: user.id, date: isoDateToUtc("2026-03-10"), minutes: 480, activityType: "development", description: DEMO_PREFIX + "Bakkerij website build" },
      { businessId, userId: user.id, date: isoDateToUtc("2026-03-11"), minutes: 360, activityType: "development", description: DEMO_PREFIX + "App bugfixes" },
      { businessId, userId: user.id, date: isoDateToUtc("2026-03-12"), minutes: 120, activityType: "administration", description: DEMO_PREFIX + "Bookkeeping" },
    ],
  });

  console.log("Seeded FICTIONAL demo data.");
  console.log("Login: demo@example.com / demo-password-123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
