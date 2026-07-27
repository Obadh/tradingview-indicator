-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ACCOUNTANT', 'READONLY');

-- CreateEnum
CREATE TYPE "VatFilingFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "KorStatus" AS ENUM ('NOT_ENROLLED', 'ENROLLED', 'PENDING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AccountingBasis" AS ENUM ('CASH', 'INVOICE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BankUsage" AS ENUM ('PERSONAL_ONLY', 'BUSINESS_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUSINESS_INCOME', 'BUSINESS_EXPENSE', 'OWNER_CONTRIBUTION', 'OWNER_WITHDRAWAL', 'OWN_TRANSFER', 'REFUND_RECEIVED', 'REFUND_PAID', 'TAX_PAYMENT', 'VAT_REFUND', 'DEPRECIATION', 'CORRECTION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'CONFIRMED', 'RECONCILED', 'LOCKED', 'CORRECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ReviewFlag" AS ENUM ('NONE', 'NEEDS_TAX_REVIEW', 'NEEDS_ADVICE');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('BUSINESS', 'CONSUMER', 'PLATFORM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VatTreatment" AS ENUM ('DOMESTIC_HIGH', 'DOMESTIC_LOW', 'DOMESTIC_ZERO', 'EXEMPT', 'OUTSIDE_SCOPE', 'REVERSE_CHARGE_SALE', 'REVERSE_CHARGE_PURCHASE', 'EU_ACQUISITION', 'EU_SERVICE', 'IMPORT', 'FOREIGN_VAT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TaxPeriodType" AS ENUM ('VAT', 'INCOME_TAX_YEAR');

-- CreateEnum
CREATE TYPE "TaxPeriodStatus" AS ENUM ('NOT_PREPARED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'FILED_MANUALLY', 'CORRECTED');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('SUPPLIER', 'CUSTOMER', 'PLATFORM', 'AUTHORITY', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PURCHASE_INVOICE', 'SALES_INVOICE', 'RECEIPT', 'BANK_STATEMENT', 'KVK_DOCUMENT', 'BELASTINGDIENST_LETTER', 'CONTRACT', 'SUBSCRIPTION_INVOICE', 'APP_STORE_STATEMENT', 'PAYMENT_PROVIDER_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'NEEDS_REVIEW', 'CONFIRMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CREDITED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "BankAccountKind" AS ENUM ('BUSINESS', 'PERSONAL', 'CASH');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'MAPPING', 'IMPORTED', 'DISCARDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationState" AS ENUM ('UNMATCHED', 'SUGGESTED', 'PARTIALLY_MATCHED', 'MATCHED', 'IGNORED_PRIVATE', 'OWN_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'IDEAL', 'CARD', 'CASH', 'PLATFORM_SETTLEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'NONE');

-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('NEW', 'ACTION_REQUIRED', 'IN_PROGRESS', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('VAT_RETURN_DUE', 'VAT_PAYMENT_DUE', 'INCOME_TAX_PREP', 'UNREVIEWED_ITEMS', 'MISSING_DOCUMENTS', 'UNRECONCILED_BANK', 'SUBSCRIPTION_EXPIRY', 'BACKUP', 'LETTER_DEADLINE', 'RETENTION_REVIEW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "totpSecretEncrypted" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "userId" UUID,
    "ipHash" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "kvkNumber" TEXT,
    "vatId" TEXT,
    "obNumberEncrypted" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "kvkRegisteredOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "firstFinancialYear" INTEGER,
    "vatFilingFrequency" "VatFilingFrequency" NOT NULL DEFAULT 'UNKNOWN',
    "korStatus" "KorStatus" NOT NULL DEFAULT 'UNKNOWN',
    "accountingBasis" "AccountingBasis" NOT NULL DEFAULT 'UNKNOWN',
    "bankUsage" "BankUsage" NOT NULL DEFAULT 'BOTH',
    "defaultPaymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "retentionYears" INTEGER NOT NULL DEFAULT 7,
    "assetThresholdCents" INTEGER NOT NULL DEFAULT 45000,
    "ocrProviderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ocrProviderName" TEXT,
    "ocrConsentAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" UUID NOT NULL,
    "businessId" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewFlag" "ReviewFlag" NOT NULL DEFAULT 'NONE',
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "contactId" UUID,
    "categoryId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "originalAmountCents" INTEGER,
    "exchangeRate" DECIMAL(20,10),
    "exchangeRateSource" TEXT,
    "exchangeRateDate" DATE,
    "exchangeRateNote" TEXT,
    "amountCents" INTEGER NOT NULL,
    "vatAmountCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "deliveryDate" DATE,
    "dueDate" DATE,
    "paymentDate" DATE,
    "paymentMethod" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidPersonally" BOOLEAN NOT NULL DEFAULT false,
    "isPreRegistration" BOOLEAN NOT NULL DEFAULT false,
    "isMixedUse" BOOLEAN NOT NULL DEFAULT false,
    "businessUseBp" INTEGER NOT NULL DEFAULT 10000,
    "vatRecoveryBp" INTEGER NOT NULL DEFAULT 10000,
    "itDeductibleBp" INTEGER NOT NULL DEFAULT 10000,
    "mixedUseNote" TEXT,
    "businessPurpose" TEXT,
    "supplierCountry" TEXT,
    "supplierVatId" TEXT,
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "customerType" "CustomerType",
    "paymentReference" TEXT,
    "taxPeriodId" UUID,
    "correctsTransactionId" UUID,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionLine" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "ledgerAccountId" UUID NOT NULL,
    "description" TEXT,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "vatCodeId" UUID,
    "vatBaseCents" INTEGER,
    "quantity" DECIMAL(12,3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransactionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VATCode" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "treatment" "VatTreatment" NOT NULL,
    "ratePermille" INTEGER NOT NULL DEFAULT 0,
    "returnBox" TEXT,
    "inputReturnBox" TEXT,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VATCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "type" "TaxPeriodType" NOT NULL DEFAULT 'VAT',
    "year" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "TaxPeriodStatus" NOT NULL DEFAULT 'NOT_PREPARED',
    "lockedAt" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3),
    "filedSnapshot" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "kind" "ContactKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "vatId" TEXT,
    "kvkNumber" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "defaultCategoryId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ledgerAccountId" UUID,
    "defaultVatCodeId" UUID,
    "suggestAsset" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duplicateConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "documentDate" DATE,
    "title" TEXT,
    "notes" TEXT,
    "extraction" JSONB,
    "extractionStatus" TEXT,
    "retentionEligibleAt" DATE,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "transactionId" UUID,
    "invoiceId" UUID,
    "assetId" UUID,
    "paymentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "prefix" TEXT,
    "issueDate" DATE,
    "supplyDate" DATE,
    "dueDate" DATE,
    "contactId" UUID NOT NULL,
    "customerSnapshot" JSONB,
    "businessSnapshot" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalExVatCents" INTEGER NOT NULL DEFAULT 0,
    "totalVatCents" INTEGER NOT NULL DEFAULT 0,
    "totalIncVatCents" INTEGER NOT NULL DEFAULT 0,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "paymentInstructions" TEXT,
    "reverseChargeWording" TEXT,
    "notes" TEXT,
    "creditsInvoiceId" UUID,
    "pdfDocumentId" UUID,
    "transactionId" UUID,
    "finalizedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPriceExVatCents" INTEGER NOT NULL,
    "vatCodeId" UUID,
    "vatRatePermille" INTEGER NOT NULL DEFAULT 0,
    "lineExVatCents" INTEGER NOT NULL,
    "lineVatCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "kind" "BankAccountKind" NOT NULL,
    "name" TEXT NOT NULL,
    "iban" TEXT,
    "bic" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "ledgerAccountId" UUID,
    "retainOnlyBusinessLines" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "documentId" UUID,
    "format" TEXT NOT NULL DEFAULT 'CSV',
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "columnMapping" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "importId" UUID,
    "bookingDate" DATE NOT NULL,
    "valueDate" DATE,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "counterpartyName" TEXT,
    "counterpartyIban" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "fingerprint" TEXT NOT NULL,
    "state" "ReconciliationState" NOT NULL DEFAULT 'UNMATCHED',
    "stateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationMatch" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "bankTransactionId" UUID NOT NULL,
    "transactionId" UUID,
    "invoiceId" UUID,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "suggested" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "bankAccountId" UUID,
    "bankTransactionId" UUID,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID,
    "transactionId" UUID,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "purchaseDate" DATE NOT NULL,
    "inUseDate" DATE,
    "purchasePriceExVatCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "businessUseBp" INTEGER NOT NULL DEFAULT 10000,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "residualValueCents" INTEGER NOT NULL DEFAULT 0,
    "annualDepreciationCents" INTEGER,
    "disposedDate" DATE,
    "disposalProceedsCents" INTEGER,
    "notes" TEXT,
    "purchaseTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT,
    "activityType" TEXT,
    "evidenceNote" TEXT,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialLetter" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "contactId" UUID,
    "documentId" UUID,
    "sender" TEXT NOT NULL,
    "letterDate" DATE,
    "referenceNumber" TEXT,
    "taxType" TEXT,
    "period" TEXT,
    "responseDeadline" DATE,
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "LetterStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OfficialLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL DEFAULT 'CUSTOM',
    "status" "ReminderStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "details" TEXT,
    "dueDate" DATE NOT NULL,
    "taxPeriodId" UUID,
    "letterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB NOT NULL,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "summary" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "businessId" UUID,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "ipHash" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_businessId_idx" ON "Membership"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_businessId_key" ON "Membership"("userId", "businessId");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipHash_createdAt_idx" ON "LoginAttempt"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSettings_businessId_key" ON "BusinessSettings"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_businessId_key_key" ON "AppSetting"("businessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_businessId_code_key" ON "LedgerAccount"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_businessId_systemKey_key" ON "LedgerAccount"("businessId", "systemKey");

-- CreateIndex
CREATE INDEX "Transaction_businessId_date_idx" ON "Transaction"("businessId", "date");

-- CreateIndex
CREATE INDEX "Transaction_businessId_status_idx" ON "Transaction"("businessId", "status");

-- CreateIndex
CREATE INDEX "Transaction_businessId_type_idx" ON "Transaction"("businessId", "type");

-- CreateIndex
CREATE INDEX "Transaction_taxPeriodId_idx" ON "Transaction"("taxPeriodId");

-- CreateIndex
CREATE INDEX "TransactionLine_transactionId_idx" ON "TransactionLine"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionLine_ledgerAccountId_idx" ON "TransactionLine"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "VATCode_businessId_treatment_idx" ON "VATCode"("businessId", "treatment");

-- CreateIndex
CREATE UNIQUE INDEX "VATCode_businessId_code_rulesVersion_key" ON "VATCode"("businessId", "code", "rulesVersion");

-- CreateIndex
CREATE UNIQUE INDEX "TaxPeriod_businessId_type_year_periodNo_key" ON "TaxPeriod"("businessId", "type", "year", "periodNo");

-- CreateIndex
CREATE INDEX "Contact_businessId_name_idx" ON "Contact"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessId_kind_name_key" ON "Category"("businessId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_businessId_sha256_idx" ON "Document"("businessId", "sha256");

-- CreateIndex
CREATE INDEX "Document_businessId_category_idx" ON "Document"("businessId", "category");

-- CreateIndex
CREATE INDEX "Document_businessId_status_idx" ON "Document"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_storageKey_key" ON "DocumentVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentLink_documentId_idx" ON "DocumentLink"("documentId");

-- CreateIndex
CREATE INDEX "DocumentLink_transactionId_idx" ON "DocumentLink"("transactionId");

-- CreateIndex
CREATE INDEX "DocumentLink_invoiceId_idx" ON "DocumentLink"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_transactionId_key" ON "Invoice"("transactionId");

-- CreateIndex
CREATE INDEX "Invoice_businessId_status_idx" ON "Invoice"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_number_key" ON "Invoice"("businessId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_businessId_prefix_year_key" ON "InvoiceSequence"("businessId", "prefix", "year");

-- CreateIndex
CREATE INDEX "BankAccount_businessId_idx" ON "BankAccount"("businessId");

-- CreateIndex
CREATE INDEX "BankTransaction_businessId_state_idx" ON "BankTransaction"("businessId", "state");

-- CreateIndex
CREATE INDEX "BankTransaction_businessId_bookingDate_idx" ON "BankTransaction"("businessId", "bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_fingerprint_key" ON "BankTransaction"("bankAccountId", "fingerprint");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_bankTransactionId_idx" ON "ReconciliationMatch"("bankTransactionId");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_transactionId_idx" ON "ReconciliationMatch"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_businessId_date_idx" ON "Payment"("businessId", "date");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_transactionId_idx" ON "PaymentAllocation"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_purchaseTransactionId_key" ON "Asset"("purchaseTransactionId");

-- CreateIndex
CREATE INDEX "Asset_businessId_idx" ON "Asset"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_businessId_name_key" ON "Project"("businessId", "name");

-- CreateIndex
CREATE INDEX "TimeEntry_businessId_date_idx" ON "TimeEntry"("businessId", "date");

-- CreateIndex
CREATE INDEX "OfficialLetter_businessId_status_idx" ON "OfficialLetter"("businessId", "status");

-- CreateIndex
CREATE INDEX "Reminder_businessId_status_dueDate_idx" ON "Reminder"("businessId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ExportJob_businessId_createdAt_idx" ON "ExportJob"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_idx" ON "AuditLog"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedFilter_businessId_userId_name_key" ON "SavedFilter"("businessId", "userId", "name");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_correctsTransactionId_fkey" FOREIGN KEY ("correctsTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_vatCodeId_fkey" FOREIGN KEY ("vatCodeId") REFERENCES "VATCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VATCode" ADD CONSTRAINT "VATCode_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_defaultVatCodeId_fkey" FOREIGN KEY ("defaultVatCodeId") REFERENCES "VATCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditsInvoiceId_fkey" FOREIGN KEY ("creditsInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pdfDocumentId_fkey" FOREIGN KEY ("pdfDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_vatCodeId_fkey" FOREIGN KEY ("vatCodeId") REFERENCES "VATCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_purchaseTransactionId_fkey" FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialLetter" ADD CONSTRAINT "OfficialLetter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialLetter" ADD CONSTRAINT "OfficialLetter_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialLetter" ADD CONSTRAINT "OfficialLetter_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "OfficialLetter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
