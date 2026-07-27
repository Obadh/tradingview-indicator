"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewBankCsvAction,
  importBankCsvAction,
  type BankPreviewResult,
} from "@/server/actions/banking";
import { BANK_CSV_PRESETS } from "@/lib/domain/bank-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/domain/money";

interface AccountOption {
  id: string;
  name: string;
  kind: string;
}

function readHeaders(csv: string): string[] {
  const first = csv.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", ",", "\t"].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0]!;
  return first.split(delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
}

export function ImportWizard({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({ dateFormat: "YMD" });
  const [preview, setPreview] = useState<BankPreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const isPersonal = account?.kind === "PERSONAL";

  const mappingFields = useMemo(
    () =>
      [
        { key: "date", label: "Booking date", required: true },
        { key: "amount", label: "Amount", required: true },
        { key: "debitCreditIndicator", label: "Debit/credit column (if amounts are unsigned)" },
        { key: "debitValue", label: "Value meaning 'money out' (e.g. Af, Debit)" },
        { key: "counterpartyName", label: "Counterparty name" },
        { key: "counterpartyIban", label: "Counterparty IBAN" },
        { key: "description", label: "Description" },
        { key: "reference", label: "Payment reference" },
      ] as const,
    [],
  );

  const buildMapping = () => ({
    date: mapping.date ?? "",
    amount: mapping.amount ?? "",
    debitCreditIndicator: mapping.debitCreditIndicator || undefined,
    debitValue: mapping.debitValue || undefined,
    description: mapping.description || undefined,
    counterpartyName: mapping.counterpartyName || undefined,
    counterpartyIban: mapping.counterpartyIban || undefined,
    reference: mapping.reference || undefined,
    dateFormat: (mapping.dateFormat as "YMD" | "DMY") ?? "YMD",
    amountAlwaysPositive: !!mapping.debitCreditIndicator,
  });

  const doPreview = () => {
    if (!csvText) return;
    setError(null);
    startTransition(async () => {
      const res = await previewBankCsvAction({ bankAccountId: accountId, csvText, mapping: buildMapping() });
      if (!res.ok) {
        setError(res.error ?? "Could not parse the CSV.");
        return;
      }
      setPreview(res);
      setSelected(new Set(res.rows?.filter((r) => !r.duplicate).map((r) => r.rowNumber) ?? []));
    });
  };

  const doImport = () => {
    if (!csvText) return;
    setError(null);
    startTransition(async () => {
      const res = await importBankCsvAction({
        bankAccountId: accountId,
        csvText,
        mapping: buildMapping(),
        selectedRowNumbers: isPersonal ? [...selected] : null,
        storeOriginal: !isPersonal,
      });
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setDone(
        `Imported ${res.importedCount} transaction(s); ${res.duplicateCount} duplicate(s) skipped.`,
      );
      setTimeout(() => router.push("/banking"), 1200);
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {done && (
        <Alert variant="success">
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Choose account and file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="import-account">Bank account</Label>
            <Select id="import-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.kind.toLowerCase()})
                </option>
              ))}
            </Select>
          </div>
          {isPersonal && (
            <Alert variant="warning">
              <AlertTitle>Personal account — privacy note</AlertTitle>
              <AlertDescription>
                The file is only used temporarily to let you pick business-related lines. Only the
                lines you select are stored; the full statement is <strong>not</strong> kept, and
                unrelated private transactions never become bookkeeping entries.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="import-file">CSV file</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setCsvText(text);
                setHeaders(readHeaders(text));
                setPreview(null);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {csvText && (
        <Card>
          <CardHeader>
            <CardTitle>2. Map columns</CardTitle>
            <CardDescription>
              Found columns: {headers.join(", ") || "(none)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="preset">Preset</Label>
              <Select
                id="preset"
                defaultValue=""
                onChange={(e) => {
                  const preset = BANK_CSV_PRESETS[e.target.value];
                  if (preset) setMapping({ ...preset } as unknown as Record<string, string>);
                }}
              >
                <option value="">Custom mapping</option>
                {Object.keys(BANK_CSV_PRESETS).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {mappingFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`map-${f.key}`}>
                    {f.label}
                    {"required" in f && f.required ? " *" : ""}
                  </Label>
                  {f.key === "debitValue" ? (
                    <Input
                      id={`map-${f.key}`}
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <Select
                      id={`map-${f.key}`}
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    >
                      <option value="">— not present —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="map-dateformat">Date format</Label>
                <Select
                  id="map-dateformat"
                  value={mapping.dateFormat ?? "YMD"}
                  onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))}
                >
                  <option value="YMD">Year-Month-Day (2026-01-31)</option>
                  <option value="DMY">Day-Month-Year (31-01-2026)</option>
                </Select>
              </div>
            </div>
            <Button onClick={doPreview} disabled={pending || !mapping.date || !mapping.amount}>
              {pending ? "Parsing…" : "Preview"}
            </Button>
          </CardContent>
        </Card>
      )}

      {preview?.rows && (
        <Card>
          <CardHeader>
            <CardTitle>3. {isPersonal ? "Select business-related lines" : "Review and import"}</CardTitle>
            <CardDescription>
              {preview.rows.length} row(s) parsed
              {preview.errors && preview.errors.length > 0 && `, ${preview.errors.length} row(s) with errors`}
              . Duplicates (already imported earlier) are marked and skipped automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.errors && preview.errors.length > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  {preview.errors.slice(0, 5).map((e) => (
                    <p key={e.rowNumber}>
                      Row {e.rowNumber}: {e.message}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isPersonal && <TableHead>Keep</TableHead>}
                    <TableHead>Date</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((r) => (
                    <TableRow key={r.rowNumber} className={r.duplicate ? "opacity-50" : ""}>
                      {isPersonal && (
                        <TableCell>
                          <Checkbox
                            aria-label={`Keep row ${r.rowNumber}`}
                            checked={selected.has(r.rowNumber)}
                            disabled={r.duplicate}
                            onChange={(e) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(r.rowNumber);
                                else next.delete(r.rowNumber);
                                return next;
                              })
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell>{r.bookingDate}</TableCell>
                      <TableCell>{r.counterpartyName ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {r.description ?? "—"}
                        {r.duplicate && " (duplicate)"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(r.amountCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={doImport} disabled={pending || (isPersonal && selected.size === 0)}>
              {pending
                ? "Importing…"
                : isPersonal
                  ? `Import ${selected.size} selected line(s)`
                  : "Import all rows"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
