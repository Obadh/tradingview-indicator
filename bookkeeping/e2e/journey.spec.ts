import { test, expect, type Page } from "@playwright/test";

/**
 * The complete owner journey, in order:
 *  1. Create business profile
 *  2. Upload Apple invoice
 *  3. Mark it as pre-registration and paid personally
 *  4. Confirm extracted/entered fields
 *  5. Upload KVK invoice (record the KVK fee)
 *  6. Add an owner contribution
 *  7. Import a bank CSV
 *  8. Match a transaction
 *  9. Record an App Store payout
 * 10. Prepare quarterly VAT summary
 * 11. Export the complete administration ZIP
 */

test.describe.configure({ mode: "serial" });

const EMAIL = "owner@example.com";
const PASSWORD = "a-long-demo-password-123";

function fakePdf(title: string): Buffer {
  // Minimal valid PDF with recognizable text for the stub extractor.
  const content = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
% ${title} Invoice Number: APL-2026-777 Invoice Date: 2026-01-15 Total: 99.00 EUR
trailer<</Root 1 0 R>>
%%EOF`;
  return Buffer.from(content, "latin1");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|onboarding/);
}

test("1. create owner account and business profile", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/login/);

  await login(page);
  await page.waitForURL(/onboarding/);

  // Ids are used here because the labels contain help-tip buttons whose
  // accessible names include the label text (strict-mode ambiguity).
  await page.locator("#legalName").fill("E2E Owner Eenmanszaak");
  await page.locator("#tradeName").fill("E2E Apps");
  await page.locator("#kvkNumber").fill("96999999");
  await page.locator("#kvkRegisteredOn").fill("2026-02-01");

  await page.getByRole("button", { name: "2. Contact & bank" }).click();
  await page.locator("#iban").fill("NL13TEST0123456789");

  await page.getByRole("button", { name: "3. Tax settings" }).click();
  await page.locator("#vatFilingFrequency").selectOption("QUARTERLY");
  await page.locator("#firstFinancialYear").fill("2026");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("2-4. upload Apple invoice, create pre-registration expense paid personally", async ({
  page,
}) => {
  await login(page);
  await page.goto("/documents");
  const fileInput = page.locator('input[type="file"]').first();
  await page.getByLabel("Document type").selectOption("PURCHASE_INVOICE");
  await fileInput.setInputFiles({
    name: "apple-developer-invoice.pdf",
    mimeType: "application/pdf",
    buffer: fakePdf("Apple Developer Program"),
  });
  await expect(page.getByText("apple-developer-invoice.pdf uploaded.")).toBeVisible();

  // Open the document and start an expense from it.
  await page.getByRole("link", { name: "apple-developer-invoice.pdf" }).first().click();
  await expect(page.getByText(/Suggested values|Details/)).toBeVisible();
  await page.getByRole("link", { name: "expense", exact: true }).click();
  await page.waitForURL(/expenses\/new/);

  await page.locator("#party-name").fill("Apple Distribution International");
  await page.locator("#party-country").fill("IE");
  await page.locator("#invoice-date").fill("2026-01-15");
  await page.locator("#flow-description").fill("Apple Developer Program membership");
  await page.locator("#flow-category").selectOption({ label: "Apple Developer Program" });
  await page.locator("#line-desc-0").fill("Developer Program 1 year");
  await page.locator("#line-net-0").fill("99,00");
  await page
    .locator("#line-vatcode-0")
    .selectOption({ label: "Foreign VAT charged (not recoverable in NL)" });
  await page.locator("#line-vat-0").fill("0");
  await page.locator("#paid-from").selectOption("PERSONAL");

  // Pre-registration warning appears because the date predates KVK registration.
  await expect(page.getByText(/before your KVK registration/)).toBeVisible();
  await page.getByRole("button", { name: "Save for review" }).click();
  // Validation warnings (e.g. missing supplier address) never block saving;
  // the form offers a link to the saved record instead of auto-navigating.
  await expect(page.getByText("Saved with warnings")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "View the saved record" }).click();
  await page.waitForURL(/transactions\//, { timeout: 30_000 });
  await expect(page.getByText("Pre-registration expense")).toBeVisible();
  await expect(page.getByText("Yes — personally (owner contribution)")).toBeVisible();
});

test("5. record the KVK registration fee", async ({ page }) => {
  await login(page);
  await page.goto("/expenses/new");
  await page.locator("#party-name").fill("Kamer van Koophandel");
  await page.locator("#invoice-date").fill("2026-02-01");
  await page.locator("#flow-description").fill("KVK registration fee");
  await page.locator("#flow-category").selectOption({ label: "KVK registration" });
  await page.locator("#line-desc-0").fill("KVK registration");
  await page.locator("#line-net-0").fill("82,25");
  await page.locator("#line-vatcode-0").selectOption({ label: "Outside scope of VAT" });
  await page.locator("#line-vat-0").fill("0");
  await page.locator("#paid-from").selectOption("PERSONAL");
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await expect(page.getByText("Saved with warnings")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "View the saved record" }).click();
  await page.waitForURL(/transactions\//, { timeout: 30_000 });
  await expect(page.getByText("Confirmed").first()).toBeVisible();
});

test("6. add an owner contribution", async ({ page }) => {
  await login(page);
  await page.goto("/transactions/owner");
  await page.getByLabel("What happened?").selectOption("OWNER_CONTRIBUTION");
  await page.getByLabel("Date").fill("2026-02-05");
  await page.getByLabel("Amount (EUR)").fill("1000,00");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/transactions\//, { timeout: 30_000 });
  await expect(page.getByText("Owner contribution (privéstorting)").first()).toBeVisible();
});

test("7-8. import a bank CSV and match a transaction", async ({ page }) => {
  await login(page);

  // First record income that the bank line will match.
  await page.goto("/income/new");
  await page.locator("#party-name").fill("Bakkerij Demo");
  await page.locator("#invoice-number").fill("INV-42");
  await page.locator("#invoice-date").fill("2026-03-15");
  await page.locator("#flow-description").fill("Website project");
  await page.locator("#flow-category").selectOption({ label: "Client invoices" });
  await page.locator("#line-desc-0").fill("Website development");
  await page.locator("#line-net-0").fill("1000,00");
  await page.locator("#line-vatcode-0").selectOption({ label: "NL 21% (high rate)" });
  await page.locator("#received-into").selectOption("NOT_RECEIVED");
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await page.waitForURL(/transactions\//, { timeout: 30_000 });

  // Import the CSV containing the matching payment.
  await page.goto("/banking/import");
  const csv = [
    "Date;Amount;Name;IBAN;Description",
    "2026-03-20;1210,00;Bakkerij Demo;NL13TEST0999888777;Payment INV-42",
    "2026-03-21;-12,10;DemoHost;NL13TEST0111222333;Hosting invoice",
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByLabel(/Booking date/).selectOption("Date");
  await page.getByLabel(/^Amount \*/).selectOption("Amount");
  await page.getByLabel("Counterparty name").selectOption("Name");
  await page.getByLabel("Counterparty IBAN").selectOption("IBAN");
  await page.getByLabel("Description", { exact: true }).selectOption("Description");
  await page.getByLabel("Date format").selectOption("YMD");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("2 row(s) parsed")).toBeVisible();
  await page.getByRole("button", { name: "Import all rows" }).click();
  await page.waitForURL(/banking$/, { timeout: 30_000 });

  // Match the incoming payment to the recorded income.
  const row = page.getByRole("row", { name: /Bakkerij Demo/ });
  await row.getByRole("button", { name: "Match" }).click();
  await expect(page.getByText(/invoice number "INV-42" in description|exact amount/)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Confirm match" }).first().click();
  await expect(page.getByRole("row", { name: /Bakkerij Demo/ }).getByText("Fully matched")).toBeVisible({
    timeout: 15_000,
  });
});

test("9. record an App Store payout", async ({ page }) => {
  await login(page);
  await page.goto("/income/new");
  await page.locator("#party-name").fill("Apple App Store");
  await page.locator("#customer-type").selectOption("PLATFORM");
  await page.locator("#party-country").fill("IE");
  await page.locator("#invoice-date").fill("2026-04-05");
  await page.locator("#flow-description").fill("App Store payout March");
  await page.locator("#flow-category").selectOption({ label: "App Store payouts" });
  await page.locator("#line-desc-0").fill("App sales March");
  await page.locator("#line-net-0").fill("420,00");
  await page.locator("#line-vatcode-0").selectOption({ label: "Outside scope of VAT" });
  await page.locator("#line-vat-0").fill("0");
  await page.locator("#platform-fee").fill("63,00");
  await page.locator("#received-into").selectOption("BUSINESS_BANK");
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await page.waitForURL(/transactions\//, { timeout: 30_000 });
  await expect(page.getByText("Platform commission")).toBeVisible();
});

test("10. prepare the quarterly VAT summary", async ({ page }) => {
  await login(page);
  await page.goto("/vat/2026/1");
  await expect(
    page.getByText("Preparation summary — verify before submitting to the Belastingdienst."),
  ).toBeVisible();
  await expect(page.getByText("1b — Supplies taxed at the low rate").or(page.getByText("1a — Supplies taxed at the high rate"))).toBeVisible();
  // Q1 still has records needing review (the Apple expense) — locking is blocked.
  await expect(page.getByText(/record\(s\) excluded — need review first/)).toBeVisible();
});

test("11. export the complete administration ZIP", async ({ page }) => {
  await login(page);
  await page.goto("/export");
  await page.getByLabel("Export by").selectOption("year");
  await page.getByLabel("Year").selectOption("2026");
  await page.getByRole("button", { name: "Build export ZIP" }).click();
  await expect(page.getByText("Export completed — download it below.")).toBeVisible({
    timeout: 60_000,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download ZIP" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});
