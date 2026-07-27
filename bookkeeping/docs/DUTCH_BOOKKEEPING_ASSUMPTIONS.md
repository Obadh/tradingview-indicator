# Dutch bookkeeping assumptions

This file lists every tax or bookkeeping assumption the application makes.
Each item is classified as one of:

- **[BEHAVIOR]** — confirmed application behavior (how the software works).
- **[CONFIGURABLE]** — a rule the user (or a future adviser) can change in
  settings or data (e.g. VAT codes).
- **[USER-CONFIRM]** — the application only suggests; the user must confirm.
- **[ADVISER]** — requires a Dutch accountant or tax adviser. The app flags
  these and never decides them.

> **General disclaimer.** This software assists with bookkeeping. It does
> not provide tax advice, it does not guarantee that any expense is
> deductible, and its VAT and income-tax figures are estimates for
> preparation purposes only. Verify everything with the Belastingdienst
> rules or a professional before filing.

## VAT

1. **[CONFIGURABLE]** Dutch VAT rates of 21% (high), 9% (low) and 0% are
   seeded as versioned `VATCode` rows valid from 2019-01-01. A rate change
   is entered as a new row with a new `validFrom`; nothing is hardcoded in
   UI logic.
2. **[CONFIGURABLE]** Default mapping of treatments to Dutch VAT return
   boxes (omzetbelasting aangifte): domestic high → 1a, domestic low → 1b,
   domestic 0% / exports outside EU → 1e, reverse-charged sales to NL
   customers → 1e, intra-EU supplies of services (B2B) → 3b, EU service
   purchases → 4b (with input deduction in 5b), EU acquisitions → 4b,
   non-EU imports → 4a, input VAT → 5b. **The preparation screen labels its
   output "Preparation summary — verify before submitting to the
   Belastingdienst" and is never filed automatically.**
3. **[USER-CONFIRM]** VAT treatment of every transaction is a suggestion
   (from category defaults or extraction) until the user confirms it.
4. **[BEHAVIOR]** Foreign VAT (e.g. Irish VAT on a consumer-account Apple
   invoice) is **never** treated as recoverable Dutch input VAT. It is
   recorded as cost with treatment `FOREIGN_VAT` and flagged "needs tax
   review".
5. **[ADVISER]** Whether a specific EU/non-EU purchase is a reverse-charged
   service (btw verlegd, box 4b), an EU acquisition, or out of scope depends
   on facts (B2B status, VAT ID used, place of supply). The app suggests
   based on supplier country + VAT ID and always flags international
   transactions for review.
6. **[ADVISER]** KOR (kleineondernemersregeling): the app stores enrollment
   status as entered by the user and shows a banner that KOR changes VAT
   obligations, but it does not decide eligibility or adjust filings
   automatically.
7. **[USER-CONFIRM]** VAT filing frequency (monthly/quarterly/yearly) is
   entered by the user from the official Belastingdienst letter. The app
   never guesses filing obligations; with frequency "unknown" no deadline
   reminders are generated.
8. **[CONFIGURABLE]** VAT return/payment deadline is assumed to be the last
   day of the month following the period end (standard for domestic
   quarterly/monthly filers). Stored as a rule constant with the VAT rules
   version; shown as "typical deadline — check your own letter".
9. **[BEHAVIOR]** Locked VAT periods are read-only. Any change to a locked
   period must go through an explicit `CORRECTION` transaction that is
   audit-logged and appears in the next open period (suppletie is flagged
   as an **[ADVISER]** topic when the correction is large).
10. **[ADVISER]** Threshold rules for suppletie (correcting a filed VAT
    return) are not computed; the app only flags that corrections to filed
    periods may require a suppletie.

## Income tax / deductibility

11. **[BEHAVIOR]** The app never states an expense is deductible with
    certainty. Deductibility percentages are user-entered fields with
    defaults of 100% and explanatory help text.
12. **[ADVISER]** Partial deductibility regimes (e.g. mixed-cost rules,
    home-office rules, private use of business assets) are not automated.
    The mixed-use fields (business %, VAT recovery %, income-tax %) exist,
    but the correct percentages are for the user/adviser to determine.
13. **[USER-CONFIRM]** Pre-registration (aanloopkosten) expenses are flagged
    `isPreRegistration` and put in "needs review"; the app never assumes
    they are deductible.
14. **[ADVISER]** Hour-dependent facilities (urencriterium, zelfstandigen-
    aftrek, startersaftrek): the time-tracking module records hours and
    exports yearly totals, but the app never states the user qualifies for
    any facility.
15. **[BEHAVIOR]** "Estimated result (income − expenses)" on the dashboard
    is an accounting estimate, labeled as such; it is not taxable profit.

## Accounting records

16. **[CONFIGURABLE]** Default accounting basis is the invoice basis
    (factuurstelsel). The user can select cash basis (kasstelsel) or
    "unknown" in onboarding; with "unknown" the app uses invoice dates and
    shows a banner to confirm with an adviser. **[ADVISER]** Which basis the
    user must apply for VAT depends on their sector/customers.
17. **[BEHAVIOR]** Owner contributions (privéstorting) and owner
    withdrawals (privéopname) book against equity accounts and never touch
    profit. Transfers between the user's own accounts book asset-to-asset
    and are neither income nor expense.
18. **[BEHAVIOR]** Every finalized financial event produces balanced journal
    lines; finalization is refused if debits ≠ credits.
19. **[CONFIGURABLE]** The seeded chart of accounts is a minimal set
    suitable for an eenmanszaak (bank, cash, owner equity/contribution/
    withdrawal, receivable, payable, revenue, platform fees, expense groups,
    input/output VAT, VAT payable/receivable, fixed assets, depreciation,
    tax clearing). Users can add accounts; system accounts are protected.
20. **[CONFIGURABLE]** Purchases at or above €450 excluding VAT (default,
    configurable) trigger an *asset suggestion*; **[USER-CONFIRM]** the user
    decides asset vs. immediate expense. **[ADVISER]** Investment rules
    (KIA, willekeurige afschrijving) are out of scope.
21. **[CONFIGURABLE]** Default depreciation is straight-line over 60 months
    with 0 residual value (common practice; max 20%/yr for most assets).
    **[ADVISER]** The correct useful life/residual value per asset.

## Currency

22. **[BEHAVIOR]** Bookkeeping currency is EUR. Foreign-currency records
    store the original amount, the exchange rate, its source and date, and
    an explanation when manually overridden.
23. **[USER-CONFIRM]** There is no automatic exchange-rate feed (privacy:
    no external calls). The user enters the rate from the bank statement or
    ECB reference; the form links to the ECB page. **[ADVISER]** Which rate
    source is acceptable for the user's situation.

## Invoicing

24. **[BEHAVIOR]** Sales invoices get a gapless-intent sequential number per
    prefix+year at finalization. Finalized invoices are immutable; changes
    require a credit note (which references the original) or a new invoice.
25. **[CONFIGURABLE]** Required invoice fields follow the Belastingdienst
    list (names/addresses, KVK, VAT ID, date, number, description, quantity,
    net, rate, VAT amount). Validation warns on missing fields but only
    blocks when data integrity would break (e.g. duplicate number).
26. **[BEHAVIOR]** For intra-EU B2B reverse-charged services the invoice
    prints "Btw verlegd / VAT reverse charged" and requires the customer VAT
    ID. **[ADVISER]** whether reverse charge actually applies to a given
    customer/service.
27. **[ADVISER]** ICP declaration (opgaaf intracommunautaire prestaties) is
    not generated; EU B2B sales are listed in reports so an adviser can file
    it.

## Documents & retention

28. **[BEHAVIOR]** Originals are preserved byte-for-byte with SHA-256
    checksums; previews/derived files are stored as additional versions.
29. **[BEHAVIOR]** Default retention is 7 years (fiscale bewaarplicht),
    configurable upward; special categories can carry longer periods (e.g.
    real-estate 10 years). Nothing is auto-deleted: the app computes the
    earliest eligible date, warns, requires typed confirmation, writes an
    audit record, and recommends professional confirmation first.
30. **[BEHAVIOR]** Digital invoices remain stored digitally in original
    form (required for digital records).

## Miscellaneous

31. **[BEHAVIOR]** Business dates use Europe/Amsterdam; storage is UTC.
32. **[BEHAVIOR]** Demo/seed data is clearly labeled fictional and uses the
    reserved KVK test number range and example.com addresses.
33. **[ADVISER]** Everything not listed as [BEHAVIOR] above ultimately needs
    professional confirmation; the review inbox has a dedicated
    "Needs advice" state to collect such items for an adviser.
