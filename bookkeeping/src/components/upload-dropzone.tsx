"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface PendingDuplicate {
  file: File;
  existingFilename: string;
  uploadedAt: string;
}

/**
 * Drag-and-drop + file picker + mobile camera upload. Duplicate checksums
 * are surfaced with an explicit "upload anyway" confirmation.
 */
export function UploadDropzone({ defaultCategory = "OTHER" }: { defaultCategory?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState(defaultCategory);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ kind: "error" | "success"; text: string }[]>([]);
  const [duplicate, setDuplicate] = useState<PendingDuplicate | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const uploadOne = useCallback(
    async (file: File, allowDuplicate = false) => {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      if (allowDuplicate) form.append("allowDuplicate", "true");
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      if (res.status === 409) {
        const body = await res.json();
        setDuplicate({
          file,
          existingFilename: body.duplicate?.filename ?? "unknown file",
          uploadedAt: body.duplicate?.uploadedAt ?? "",
        });
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        setMessages((m) => [...m, { kind: "error", text: `${file.name}: ${body.error}` }]);
        return false;
      }
      setMessages((m) => [...m, { kind: "success", text: `${file.name} uploaded.` }]);
      return true;
    },
    [category],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setMessages([]);
      for (const file of Array.from(files)) {
        await uploadOne(file);
      }
      setBusy(false);
      router.refresh();
    },
    [uploadOne, router],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="upload-category">Document type</Label>
          <Select
            id="upload-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-64"
          >
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInput.current?.click()}
          aria-label="Take a photo of a receipt"
        >
          <Camera aria-hidden /> Photo
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files: drag and drop, click, or press Enter to choose files"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground",
          dragOver ? "border-primary bg-accent/40" : "border-input",
          busy && "opacity-50",
        )}
      >
        <UploadCloud className="size-8" aria-hidden />
        <p>
          {busy ? "Uploading…" : "Drag files here, or click to choose"}
          <br />
          <span className="text-xs">
            PDF, JPG, PNG, HEIC, XML/UBL invoices, CSV bank exports. Originals are preserved
            unchanged.
          </span>
        </p>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.xml,.ubl,.csv,application/pdf,image/jpeg,image/png,image/heic,text/xml,text/csv"
        onChange={(e) => e.target.files && void handleFiles(e.target.files)}
      />
      <input
        ref={cameraInput}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files && void handleFiles(e.target.files)}
      />

      {duplicate && (
        <Alert variant="warning">
          <AlertDescription className="space-y-2">
            <p>
              “{duplicate.file.name}” is byte-for-byte identical to “{duplicate.existingFilename}”
              uploaded earlier{duplicate.uploadedAt && ` (${new Date(duplicate.uploadedAt).toLocaleDateString()})`}.
              Uploading it again creates an intentional duplicate.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const f = duplicate.file;
                  setDuplicate(null);
                  setBusy(true);
                  await uploadOne(f, true);
                  setBusy(false);
                  router.refresh();
                }}
              >
                Upload anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDuplicate(null)}>
                Skip this file
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div aria-live="polite" className="space-y-1">
        {messages.map((m, i) => (
          <p key={i} className={m.kind === "error" ? "text-sm text-destructive" : "text-sm text-success"}>
            {m.text}
          </p>
        ))}
      </div>
    </div>
  );
}
