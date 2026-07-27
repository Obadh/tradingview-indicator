"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTimeEntryAction } from "@/server/actions/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TimeEntryForm() {
  const [state, formAction, pending] = useActionState(createTimeEntryAction, null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("0");

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (startRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const stopTimer = () => {
    setRunning(false);
    const totalMinutes = Math.max(1, Math.round(elapsed / 60));
    setHours(String(Math.floor(totalMinutes / 60)));
    setMinutes(String(totalMinutes % 60));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add time entry</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-3">
          {!running ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                startRef.current = Date.now();
                setElapsed(0);
                setRunning(true);
              }}
            >
              Start timer
            </Button>
          ) : (
            <Button type="button" onClick={stopTimer}>
              Stop timer ({Math.floor(elapsed / 3600)}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:
              {String(elapsed % 60).padStart(2, "0")})
            </Button>
          )}
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {running ? "Timer running — stop it to fill the duration below." : "Or enter the duration manually."}
          </span>
        </div>
        <form action={formAction} className="grid gap-4 sm:grid-cols-3">
          {state?.error && (
            <Alert variant="destructive" className="sm:col-span-3">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && (
            <Alert variant="success" className="sm:col-span-3">
              <AlertDescription>Time entry saved.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="time-date">Date</Label>
            <Input id="time-date" name="date" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-hours">Hours</Label>
            <Input id="time-hours" name="hours" type="number" min={0} max={24} step="1" value={hours} onChange={(e) => setHours(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-minutes">Minutes</Label>
            <Input id="time-minutes" name="minutes" type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-project">Project (optional)</Label>
            <Input id="time-project" name="projectName" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-activity">Activity type</Label>
            <Select id="time-activity" name="activityType" defaultValue="development">
              <option value="development">Development</option>
              <option value="design">Design</option>
              <option value="administration">Administration</option>
              <option value="acquisition">Acquisition / marketing</option>
              <option value="support">Support</option>
              <option value="travel">Travel</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-desc">Description</Label>
            <Input id="time-desc" name="description" maxLength={500} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="time-evidence">Evidence / note (optional)</Label>
            <Input id="time-evidence" name="evidenceNote" maxLength={500} placeholder="e.g. git commits, client meeting notes" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save entry"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
