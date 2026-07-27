"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOwnerFlowAction } from "@/server/actions/owner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export function OwnerFlowForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("OWNER_CONTRIBUTION");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [fromAccount, setFromAccount] = useState("bank_personal");
  const [toAccount, setToAccount] = useState("bank_business");

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createOwnerFlowAction({
        kind,
        date,
        amount,
        description,
        fromAccount: kind === "OWNER_CONTRIBUTION" ? undefined : fromAccount,
        toAccount: kind === "OWNER_WITHDRAWAL" ? undefined : toAccount,
      });
      if (res.ok && res.transactionId) router.push(`/transactions/${res.transactionId}`);
      else setError(res.error ?? "Could not save.");
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="owner-kind">What happened?</Label>
          <Select
            id="owner-kind"
            value={kind}
            onChange={(e) => {
              const k = e.target.value;
              setKind(k);
              // Sensible account defaults per flow direction.
              if (k === "OWNER_CONTRIBUTION") setToAccount("bank_business");
              if (k === "OWNER_WITHDRAWAL") setFromAccount("bank_business");
              if (k === "OWN_TRANSFER") {
                setFromAccount("bank_personal");
                setToAccount("bank_business");
              }
            }}
          >
            <option value="OWNER_CONTRIBUTION">I put private money into the business</option>
            <option value="OWNER_WITHDRAWAL">I took business money for private use</option>
            <option value="OWN_TRANSFER">I moved money between my own accounts</option>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="owner-date">Date</Label>
            <Input id="owner-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-amount">Amount (EUR)</Label>
            <Input id="owner-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>
        {kind === "OWN_TRANSFER" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="owner-from">From account</Label>
              <Select id="owner-from" value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
                <option value="bank_personal">Personal bank account</option>
                <option value="bank_business">Business bank account</option>
                <option value="cash">Cash</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-to">To account</Label>
              <Select id="owner-to" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
                <option value="bank_business">Business bank account</option>
                <option value="bank_personal">Personal bank account</option>
                <option value="cash">Cash</option>
              </Select>
            </div>
          </div>
        )}
        {kind === "OWNER_CONTRIBUTION" && (
          <div className="space-y-1.5">
            <Label htmlFor="owner-to2">Into which account?</Label>
            <Select id="owner-to2" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="bank_business">Business bank account</option>
              <option value="bank_personal">Personal account (kept for business)</option>
              <option value="cash">Cash</option>
            </Select>
          </div>
        )}
        {kind === "OWNER_WITHDRAWAL" && (
          <div className="space-y-1.5">
            <Label htmlFor="owner-from2">From which account?</Label>
            <Select id="owner-from2" value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
              <option value="bank_business">Business bank account</option>
              <option value="cash">Cash</option>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="owner-desc">Description (optional)</Label>
          <Input id="owner-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>
        <Button onClick={submit} disabled={pending || !date || !amount}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
