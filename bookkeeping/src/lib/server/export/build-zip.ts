/**
 * "Export administration" ZIP builder. Produces one archive with a
 * predictable folder structure containing original documents, human-readable
 * CSVs, XLSX/PDF reports, a checksum manifest, the audit log, and a README.
 *
 * The ZIP is an organized export for the owner, a bookkeeper, or a requested
 * inspection — nothing is ever sent to the tax authority automatically.
 */

import archiver from "archiver";
import { PassThrough } from "stream";
import { prisma } from "@/lib/server/db";
import { storage } from "@/lib/server/storage";
import { buildReport } from "@/lib/server/reports";
import { reportToCsv, reportToPdf, reportToXlsx } from "@/lib/server/reports/serialize";
import { exportFilename } from "@/lib/domain/filenames";
import { utcToIsoDate } from "@/lib/domain/dates";
import { decryptString, maskIdentifier } from "@/lib/server/crypto";
import { vatPeriodData } from "@/lib/server/queries/vat";
import { APP_VERSION, DATA_SCHEMA_VERSION } from "@/lib/version";

export interface ExportParams {
  businessId: string;
  from: string; // ISO date inclusive
  to: string; // ISO date inclusive
  scopeLabel: string; // "Financial year 2026", "Q2 2026", ...
  includeObNumber: boolean; // decrypted omzetbelastingnummer in the profile?
}

export interface ExportResult {
  zip: Buffer;
  summary: {
    documents: number;
    transactions: number;
    missingDocuments: number;
    unresolvedItems: number;
  };
}

const CATEGORY_FOLDERS: Record<string, string> = {
  PURCHASE_INVOICE: "purchases",
  SUBSCRIPTION_INVOICE: "purchases",
  RECEIPT: "purchases",
  SALES_INVOICE: "sales",
  APP_STORE_STATEMENT: "sales",
  PAYMENT_PROVIDER_STATEMENT: "sales",
  BANK_STATEMENT: "bank",
  KVK_DOCUMENT: "business-profile",
  BELASTINGDIENST_LETTER: "tax-letters",
  CONTRACT: "contracts",
  OTHER: "purchases",
};

export async function buildExportZip(params: ExportParams): Promise<ExportResult> {
  const { businessId } = params;
  const fromDate = new Date(`${params.from}T00:00:00Z`);
  const toDate = new Date(`${params.to}T23:59:59Z`);

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: { settings: true },
  });

  const [documents, transactions, invoices, bankLines, assets, timeEntries, auditRows, letters] =
    await Promise.all([
      prisma.document.findMany({
        where: {
          businessId,
          deletedAt: null,
          OR: [
            { documentDate: { gte: fromDate, lte: toDate } },
            { documentDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
          ],
        },
        include: {
          links: {
            include: {
              transaction: { select: { id: true, date: true, description: true, invoiceNumber: true, amountCents: true, contact: { select: { name: true } } } },
              invoice: { select: { id: true, number: true } },
            },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { businessId, date: { gte: fromDate, lte: toDate }, status: { notIn: ["VOID"] } },
        include: {
          lines: { include: { ledgerAccount: true, vatCode: true }, orderBy: { sortOrder: "asc" } },
          contact: { select: { name: true } },
          category: { select: { name: true } },
          documentLinks: { select: { documentId: true } },
        },
        orderBy: { date: "asc" },
      }),
      prisma.invoice.findMany({
        where: { businessId, issueDate: { gte: fromDate, lte: toDate } },
        include: { contact: true, lines: true },
      }),
      prisma.bankTransaction.findMany({
        where: { businessId, bookingDate: { gte: fromDate, lte: toDate } },
        include: { bankAccount: { select: { name: true, iban: true } } },
        orderBy: { bookingDate: "asc" },
      }),
      prisma.asset.findMany({ where: { businessId, deletedAt: null } }),
      prisma.timeEntry.findMany({
        where: { businessId, deletedAt: null, date: { gte: fromDate, lte: toDate } },
      }),
      prisma.auditLog.findMany({
        where: { businessId, createdAt: { gte: fromDate, lte: toDate } },
        orderBy: { createdAt: "asc" },
        take: 50_000,
      }),
      prisma.officialLetter.findMany({ where: { businessId, deletedAt: null } }),
    ]);

  const archive = archiver("zip", { zlib: { level: 6 } });
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    sink.on("finish", () => resolve());
    archive.on("error", reject);
  });
  archive.pipe(sink);

  const csvEscape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (headers: string[], rows: unknown[][]) =>
    [headers.join(";"), ...rows.map((r) => r.map(csvEscape).join(";"))].join("\r\n");

  // --- business profile -----------------------------------------------
  const profile = {
    exportedAt: new Date().toISOString(),
    scope: params.scopeLabel,
    period: { from: params.from, to: params.to },
    applicationVersion: APP_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    business: {
      legalName: business.legalName,
      tradeName: business.tradeName,
      kvkNumber: business.kvkNumber,
      vatId: business.vatId,
      omzetbelastingNumber: params.includeObNumber
        ? business.obNumberEncrypted
          ? decryptString(business.obNumberEncrypted)
          : null
        : maskIdentifier(business.obNumberEncrypted ? "hidden-by-choice" : null) || "(not included)",
      address: [business.addressLine1, business.postalCode, business.city, business.country]
        .filter(Boolean)
        .join(", "),
      email: business.email,
      phone: business.phone,
      iban: business.iban,
      kvkRegisteredOn: business.kvkRegisteredOn ? utcToIsoDate(business.kvkRegisteredOn) : null,
      vatFilingFrequency: business.settings?.vatFilingFrequency,
      korStatus: business.settings?.korStatus,
      accountingBasis: business.settings?.accountingBasis,
      firstFinancialYear: business.settings?.firstFinancialYear,
    },
  };
  archive.append(JSON.stringify(profile, null, 2), { name: "business-profile/profile.json" });

  // --- ledger ----------------------------------------------------------
  archive.append(
    toCsv(
      ["transaction_id", "date", "status", "type", "description", "party", "category", "account_code", "account_name", "vat_code", "debit_eur", "credit_eur"],
      transactions.flatMap((t) =>
        t.lines.map((l) => [
          t.id,
          utcToIsoDate(t.date),
          t.status,
          t.type,
          t.description,
          t.contact?.name ?? "",
          t.category?.name ?? "",
          l.ledgerAccount.code,
          l.ledgerAccount.name,
          l.vatCode?.code ?? "",
          (l.debitCents / 100).toFixed(2),
          (l.creditCents / 100).toFixed(2),
        ]),
      ),
    ),
    { name: "ledger/journal.csv" },
  );
  archive.append(
    toCsv(
      ["id", "date", "type", "status", "description", "party", "category", "invoice_number", "amount_incl_vat_eur", "vat_eur", "currency", "paid", "paid_personally", "pre_registration", "mixed_use", "business_use_pct", "needs_review_flag", "document_ids"],
      transactions.map((t) => [
        t.id,
        utcToIsoDate(t.date),
        t.type,
        t.status,
        t.description,
        t.contact?.name ?? "",
        t.category?.name ?? "",
        t.invoiceNumber ?? "",
        (t.amountCents / 100).toFixed(2),
        (t.vatAmountCents / 100).toFixed(2),
        t.currency,
        t.isPaid ? "yes" : "no",
        t.paidPersonally ? "yes" : "no",
        t.isPreRegistration ? "yes" : "no",
        t.isMixedUse ? "yes" : "no",
        (t.businessUseBp / 100).toFixed(0),
        t.reviewFlag,
        t.documentLinks.map((d) => d.documentId).join("|"),
      ]),
    ),
    { name: "ledger/transactions.csv" },
  );

  // --- documents (originals, checksum manifest, mapping) --------------
  let missingDocumentFiles = 0;
  const manifest: unknown[][] = [];
  const mapping: unknown[][] = [];
  for (const doc of documents) {
    const folder = CATEGORY_FOLDERS[doc.category] ?? "purchases";
    const link = doc.links[0];
    const name = exportFilename({
      isoDate: doc.documentDate
        ? utcToIsoDate(doc.documentDate)
        : link?.transaction
          ? utcToIsoDate(link.transaction.date)
          : utcToIsoDate(doc.uploadedAt),
      party: link?.transaction?.contact?.name ?? null,
      invoiceNumber: link?.transaction?.invoiceNumber ?? link?.invoice?.number ?? null,
      amountCents: link?.transaction?.amountCents ?? null,
      currency: "EUR",
      documentId: doc.id,
      mimeType: doc.mimeType,
      originalFilename: doc.originalFilename,
    });
    try {
      const data = await storage().get(doc.storageKey);
      archive.append(data, { name: `${folder}/${name}` });
      manifest.push([doc.id, `${folder}/${name}`, doc.originalFilename, doc.sha256, doc.sizeBytes, doc.mimeType, doc.category]);
    } catch {
      missingDocumentFiles++;
      manifest.push([doc.id, "(file missing from storage!)", doc.originalFilename, doc.sha256, doc.sizeBytes, doc.mimeType, doc.category]);
    }
    for (const l of doc.links) {
      mapping.push([doc.id, `${folder}/${name}`, l.transaction?.id ?? "", l.transaction?.description ?? "", l.invoice?.number ?? ""]);
    }
  }
  archive.append(
    toCsv(["document_id", "export_path", "original_filename", "sha256", "size_bytes", "mime_type", "category"], manifest),
    { name: "audit/document-checksums.csv" },
  );
  archive.append(
    toCsv(["document_id", "export_path", "transaction_id", "transaction_description", "invoice_number"], mapping),
    { name: "audit/document-to-record-mapping.csv" },
  );

  // --- sales -----------------------------------------------------------
  archive.append(
    toCsv(
      ["number", "kind", "status", "customer", "issue_date", "total_ex_vat_eur", "vat_eur", "total_inc_vat_eur"],
      invoices.map((i) => [
        i.number ?? "(draft)",
        i.kind,
        i.status,
        i.contact.name,
        i.issueDate ? utcToIsoDate(i.issueDate) : "",
        (i.totalExVatCents / 100).toFixed(2),
        (i.totalVatCents / 100).toFixed(2),
        (i.totalIncVatCents / 100).toFixed(2),
      ]),
    ),
    { name: "sales/invoices.csv" },
  );

  // --- bank ------------------------------------------------------------
  archive.append(
    toCsv(
      ["date", "account", "iban", "counterparty", "counterparty_iban", "description", "amount_eur", "state"],
      bankLines.map((b) => [
        utcToIsoDate(b.bookingDate),
        b.bankAccount.name,
        b.bankAccount.iban ?? "",
        b.counterpartyName ?? "",
        b.counterpartyIban ?? "",
        b.description ?? "",
        (b.amountCents / 100).toFixed(2),
        b.state,
      ]),
    ),
    { name: "bank/bank-transactions.csv" },
  );

  // --- VAT -------------------------------------------------------------
  const freq =
    business.settings?.vatFilingFrequency === "UNKNOWN" || !business.settings
      ? "QUARTERLY"
      : business.settings.vatFilingFrequency;
  const startYear = Number(params.from.slice(0, 4));
  const endYear = Number(params.to.slice(0, 4));
  for (let year = startYear; year <= endYear; year++) {
    const periods = freq === "MONTHLY" ? 12 : freq === "QUARTERLY" ? 4 : 1;
    for (let p = 1; p <= periods; p++) {
      const periodNo = freq === "YEARLY" ? 0 : p;
      const data = await vatPeriodData(businessId, freq, year, periodNo);
      if (data.range.start > params.to || data.range.end < params.from) continue;
      const label = data.range.label.replace(/\s+/g, "-");
      archive.append(JSON.stringify(data.summary, null, 2), { name: `vat/${label}.json` });
      archive.append(
        toCsv(
          ["box", "label", "base_eur", "vat_eur"],
          data.summary.boxes.map((b) => [b.box, b.label, (b.baseCents / 100).toFixed(2), (b.vatCents / 100).toFixed(2)]),
        ),
        { name: `vat/${label}.csv` },
      );
    }
  }

  // --- assets, hours ---------------------------------------------------
  archive.append(
    toCsv(
      ["name", "purchase_date", "in_use_date", "price_ex_vat_eur", "vat_eur", "business_use_pct", "method", "useful_life_months", "residual_eur", "disposed_date"],
      assets.map((a) => [
        a.name,
        utcToIsoDate(a.purchaseDate),
        a.inUseDate ? utcToIsoDate(a.inUseDate) : "",
        (a.purchasePriceExVatCents / 100).toFixed(2),
        (a.vatCents / 100).toFixed(2),
        (a.businessUseBp / 100).toFixed(0),
        a.depreciationMethod,
        a.usefulLifeMonths,
        (a.residualValueCents / 100).toFixed(2),
        a.disposedDate ? utcToIsoDate(a.disposedDate) : "",
      ]),
    ),
    { name: "assets/assets.csv" },
  );
  archive.append(
    toCsv(
      ["date", "minutes", "hours", "activity", "description"],
      timeEntries.map((e) => [utcToIsoDate(e.date), e.minutes, (e.minutes / 60).toFixed(2), e.activityType ?? "", e.description ?? ""]),
    ),
    { name: "hours/hours.csv" },
  );

  // --- letters index ---------------------------------------------------
  archive.append(
    toCsv(
      ["sender", "letter_date", "reference", "tax_type", "period", "deadline", "status", "document_id"],
      letters.map((l) => [
        l.sender,
        l.letterDate ? utcToIsoDate(l.letterDate) : "",
        l.referenceNumber ?? "",
        l.taxType ?? "",
        l.period ?? "",
        l.responseDeadline ? utcToIsoDate(l.responseDeadline) : "",
        l.status,
        l.documentId ?? "",
      ]),
    ),
    { name: "tax-letters/letters-index.csv" },
  );

  // --- audit log -------------------------------------------------------
  archive.append(
    toCsv(
      ["timestamp_utc", "actor_user_id", "action", "entity_type", "entity_id", "reason"],
      auditRows.map((a) => [a.createdAt.toISOString(), a.actorUserId ?? "", a.action, a.entityType, a.entityId ?? "", a.reason ?? ""]),
    ),
    { name: "audit/audit-log.csv" },
  );

  // --- reports (XLSX + PDF) -------------------------------------------
  for (const key of ["profit-loss", "balance-sheet", "vat-summary", "expenses-by-category", "income-by-category"]) {
    const report = await buildReport(key, businessId, { from: params.from, to: params.to });
    if (!report) continue;
    archive.append(await reportToXlsx(report), { name: `reports/${key}.xlsx` });
    archive.append(await reportToPdf(report), { name: `reports/${key}.pdf` });
    archive.append(reportToCsv(report), { name: `reports/${key}.csv` });
  }

  // --- unresolved items ------------------------------------------------
  const unresolved = transactions.filter(
    (t) => ["DRAFT", "NEEDS_REVIEW"].includes(t.status) || t.reviewFlag !== "NONE",
  );
  const missingDocs = transactions.filter(
    (t) => ["BUSINESS_EXPENSE", "BUSINESS_INCOME"].includes(t.type) && t.documentLinks.length === 0,
  );
  archive.append(
    toCsv(
      ["transaction_id", "date", "description", "issue"],
      [
        ...unresolved.map((t) => [t.id, utcToIsoDate(t.date), t.description, `status ${t.status}, flag ${t.reviewFlag}`]),
        ...missingDocs.map((t) => [t.id, utcToIsoDate(t.date), t.description, "no document attached"]),
      ],
    ),
    { name: "audit/unresolved-items.csv" },
  );

  // --- README ----------------------------------------------------------
  archive.append(readmeText(params, profile), { name: "README/README.txt" });

  await archive.finalize();
  await finished;

  return {
    zip: Buffer.concat(chunks),
    summary: {
      documents: documents.length,
      transactions: transactions.length,
      missingDocuments: missingDocs.length + missingDocumentFiles,
      unresolvedItems: unresolved.length,
    },
  };
}

function readmeText(params: ExportParams, profile: unknown): string {
  return `ADMINISTRATION EXPORT
=====================

Scope:      ${params.scopeLabel}
Period:     ${params.from} to ${params.to}
Generated:  ${new Date().toISOString()}
App:        eenmanszaak-boekhouding v${APP_VERSION} (data schema v${DATA_SCHEMA_VERSION})

WHAT THIS IS
------------
An organized export of the administration for the owner, their bookkeeper,
or a requested inspection. There is NO need to proactively send this file to
the Belastingdienst — keep it stored safely and share it when asked.

FOLDER STRUCTURE
----------------
/business-profile  Business profile snapshot (profile.json) and KVK documents
/ledger            Double-entry journal (journal.csv) and transaction list
/purchases         Original purchase invoices and receipts
/sales             Sales invoices (originals + invoices.csv)
/bank              Bank statements and imported bank transactions
/vat               VAT preparation summaries per period (CSV + JSON)
/assets            Asset register
/hours             Recorded working hours
/contracts         Contracts
/tax-letters       Letters from the Belastingdienst / KVK + index
/audit             Audit log, document checksum manifest,
                   document-to-record mapping, unresolved items
/reports           Profit & loss, balance sheet, VAT summary and category
                   reports (CSV, XLSX, PDF)
/README            This file

FILE NAMING
-----------
Documents use: YYYY-MM-DD_party_invoice-number_amount-currency_documentid.ext
The 8-character id at the end matches document_id in
/audit/document-checksums.csv, which lists the SHA-256 checksum of every
original file so integrity can be verified (e.g. sha256sum -c).

IMPORTANT NOTES
---------------
- Amounts are in EUR unless stated otherwise; VAT figures are preparation
  estimates and must be verified before filing.
- /audit/unresolved-items.csv lists records that still needed review at
  export time.
- Original files are exported byte-for-byte as uploaded.

${JSON.stringify(profile, null, 2)}
`;
}
