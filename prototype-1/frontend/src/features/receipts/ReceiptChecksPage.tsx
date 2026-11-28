import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { FileImage, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import {
  checkReceipt,
  receiptFileUrl,
  useDeleteReceiptCheck,
  useReceiptChecks,
  useSettleReceiptCheck,
} from "@/api/endpoints";
import { qk } from "@/api/queryKeys";
import type {
  ReceiptCheckResponse,
  ReceiptCheckRow,
  ReceiptSettlement,
  ReceiptVerdict,
} from "@/api/types";
import { useToast } from "@/app/toast";
import { EmptyState, ErrorCard, SkeletonRow, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ReceiptResult, VerdictBadge } from "./ReceiptResult";
import { TERM_PATTERN, currentTerm, recentTerms } from "./terms";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPT = ACCEPTED_TYPES.join(",");
const STUDENT_ID = /^\d{10}$/;

const VERDICT_OPTIONS: { value: ReceiptVerdict | ""; label: string }[] = [
  { value: "", label: "All verdicts" },
  { value: "ok", label: "OK" },
  { value: "warn", label: "Review" },
  { value: "fail", label: "Fail" },
];

const SETTLE_NOTE_MAX = 300;

const SETTLED_LABEL: Record<ReceiptSettlement, string> = { pass: "Pass", fail: "Fail" };

/** The checks that made a row need a look (warn or fail), for the dialog and the Why column. */
const needsLook = (row: ReceiptCheckRow) => row.checks.filter((c) => c.state === "warn" || c.state === "fail");

const whyText = (row: ReceiptCheckRow) => {
  const names = needsLook(row).map((c) => c.name);
  return names.length > 0 ? names.join(", ") : "—";
};

interface Notice {
  title: string;
  hint?: string;
}

/** Messages come from the server or the form only. Nothing here echoes a student ID. */
function describeError(err: unknown): Notice {
  if (err instanceof ApiError) {
    if (err.status === 503 || err.code === "SERVICE_UNAVAILABLE") {
      return {
        title: "OCR service is not running",
        hint: "Start prototype-1/ocr-service, then try again.",
      };
    }
    return { title: err.message };
  }
  if (err instanceof TypeError) return { title: "Could not reach the server." };
  return { title: "Could not check this receipt." };
}

function validate(studentId: string, term: string, file: File | null): string | null {
  if (!STUDENT_ID.test(studentId)) return "Student ID must be exactly 10 digits.";
  if (!TERM_PATTERN.test(term)) return "Term must look like 1/2569.";
  if (!file) return "Choose a PDF, JPG or PNG receipt.";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only PDF, JPG or PNG receipts are accepted.";
  if (file.size > MAX_BYTES) return "Receipt file is over 10 MB.";
  return null;
}

export function ReceiptChecksPage() {
  const qc = useQueryClient();
  const toast = useToast();

  // Check form
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState(() => currentTerm());
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Held in page state only: it carries the student's name, so it is never cached or stored.
  const [result, setResult] = useState<ReceiptCheckResponse | null>(null);

  // Saved checks
  const termOptions = useMemo(() => recentTerms(8), []);
  const [filterTerm, setFilterTerm] = useState(() => currentTerm());
  const [filterVerdict, setFilterVerdict] = useState<ReceiptVerdict | "">("");
  const list = useReceiptChecks({
    term: filterTerm || undefined,
    verdict: filterVerdict || undefined,
  });
  const del = useDeleteReceiptCheck();
  const [pendingDelete, setPendingDelete] = useState<ReceiptCheckRow | null>(null);

  // Settle dialog: staff pick pass or fail, and a note (required for fail).
  const settle = useSettleReceiptCheck();
  const [pendingSettle, setPendingSettle] = useState<ReceiptCheckRow | null>(null);
  const [decision, setDecision] = useState<ReceiptSettlement | null>(null);
  const [settleNote, setSettleNote] = useState("");
  const [settleError, setSettleError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = validate(studentId, term, file);
    if (problem || !file) {
      setNotice({ title: problem ?? "Choose a receipt." });
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("studentId", studentId);
    form.append("term", term);

    setChecking(true);
    setNotice(null);
    try {
      setResult(await checkReceipt(form));
      void qc.invalidateQueries({ queryKey: qk.receipts });
    } catch (err) {
      setResult(null);
      setNotice(describeError(err));
    } finally {
      setChecking(false);
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast("Check deleted");
        setPendingDelete(null);
      },
      onError: () => toast("Could not delete that check."),
    });
  };

  const openSettle = (row: ReceiptCheckRow) => {
    setDecision(null);
    setSettleNote("");
    setSettleError(null);
    setPendingSettle(row);
  };

  const closeSettle = () => setPendingSettle(null);

  const confirmSettle = () => {
    if (!pendingSettle || !decision) return;
    const note = settleNote.trim();
    if (decision === "fail" && note === "") {
      setSettleError("Fail needs a note. The student will see it.");
      return;
    }
    settle.mutate(
      { id: pendingSettle.id, decision, note: note === "" ? undefined : note },
      {
        onSuccess: () => {
          toast("Check settled");
          closeSettle();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            // Already settled, or not a warn any more: show the server's words and reload the list.
            toast(err.message);
            closeSettle();
            void qc.invalidateQueries({ queryKey: qk.receipts });
            return;
          }
          setSettleError(err instanceof ApiError ? err.message : "Could not settle this check.");
        },
      },
    );
  };

  const items = list.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Receipt checks</h1>
        <p className="text-sm text-neutral-500">
          Check a tuition receipt against a student ID and term. The result (semester, amount, status,
          reference and checks) is saved; the file and the student's name never are.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_2fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-student-id">Student ID</Label>
              <Input
                id="receipt-student-id"
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                placeholder="10 digits"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.trim())}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-term">Term</Label>
              <Input
                id="receipt-term"
                autoComplete="off"
                placeholder="1/2569"
                value={term}
                onChange={(e) => setTerm(e.target.value.trim())}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receipt-file">Receipt</Label>
              <Input
                id="receipt-file"
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">PDF, JPG or PNG, up to 10 MB.</p>
            <Button type="submit" disabled={checking}>
              {checking && <Spinner />}
              Check receipt
            </Button>
          </div>

          {notice && (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-md border-2 border-neutral-900 p-3 text-sm text-neutral-950"
            >
              <p className="font-medium">{notice.title}</p>
              {notice.hint && <p className="text-xs">{notice.hint}</p>}
            </div>
          )}
        </form>
      </Card>

      {result && <ReceiptResult result={result} />}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Saved checks</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="filter-term">Term</Label>
              <Select
                id="filter-term"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
              >
                <option value="">All terms</option>
                {termOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="filter-verdict">Verdict</Label>
              <Select
                id="filter-verdict"
                value={filterVerdict}
                onChange={(e) => setFilterVerdict(e.target.value as ReceiptVerdict | "")}
              >
                {VERDICT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          {list.isPending ? (
            <div className="flex flex-col gap-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} className="h-8" />
              ))}
            </div>
          ) : list.isError ? (
            <ErrorCard message="Could not load saved checks." onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title="No saved checks for this filter." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Student ID</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Checked</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row, i) => (
                  <TableRow key={row.id} className={cn(i % 2 === 1 && "bg-neutral-100/50")}>
                    <TableCell className="pl-6 font-mono text-xs">
                      {row.studentId}
                      {row.ocrName && (
                        <div className="font-sans text-xs text-neutral-500">{row.ocrName}</div>
                      )}
                    </TableCell>
                    <TableCell>{row.term}</TableCell>
                    <TableCell>
                      <VerdictBadge verdict={row.verdict} />
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {row.settlement ? (
                        <div className="flex flex-col gap-0.5">
                          <span>
                            Settled: {SETTLED_LABEL[row.settlement]}
                            {row.settledByName && ` by ${row.settledByName}`}
                          </span>
                          {row.settleNote && (
                            <span className="break-words text-xs text-neutral-500">{row.settleNote}</span>
                          )}
                        </div>
                      ) : (
                        whyText(row)
                      )}
                    </TableCell>
                    <TableCell>{row.amount ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-neutral-500">
                      {row.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-neutral-500">
                      {format(parseISO(row.createdAt), "d MMM yyyy, HH:mm")}
                      {row.checkedByName && <div className="text-xs">by {row.checkedByName}</div>}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.hasFile && (
                          <Button variant="ghost" size="icon-sm" asChild>
                            <a
                              href={receiptFileUrl(row.id)}
                              target="_blank"
                              rel="noopener"
                              aria-label="View receipt"
                            >
                              <FileImage className="size-4" />
                            </a>
                          </Button>
                        )}
                        {row.verdict === "warn" && row.settlement === null && (
                          <Button variant="secondary" size="sm" onClick={() => openSettle(row)}>
                            Settle
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete check"
                          onClick={() => setPendingDelete(row)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this check?</DialogTitle>
            <DialogDescription>
              Removes the saved check for student {pendingDelete?.studentId}, term{" "}
              {pendingDelete?.term}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button disabled={del.isPending} onClick={confirmDelete}>
              {del.isPending && <Spinner />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingSettle !== null}
        onOpenChange={(open) => {
          if (!open) closeSettle();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle this check</DialogTitle>
            <DialogDescription>
              Student {pendingSettle?.studentId}, term {pendingSettle?.term}.
            </DialogDescription>
          </DialogHeader>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Why it needs a look</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {pendingSettle &&
                needsLook(pendingSettle).map((c) => (
                  <li key={c.name} className="break-words">
                    <span className="font-medium">{c.name}</span>
                    {c.detail && <span className="text-neutral-500"> · {c.detail}</span>}
                  </li>
                ))}
            </ul>
            {pendingSettle?.hasFile && (
              <a
                href={receiptFileUrl(pendingSettle.id)}
                target="_blank"
                rel="noopener"
                className="w-fit text-sm font-medium underline underline-offset-4"
              >
                View receipt
              </a>
            )}
          </section>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Decision</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="settle-decision"
                value="pass"
                checked={decision === "pass"}
                onChange={() => {
                  setDecision("pass");
                  setSettleError(null);
                }}
              />
              Pass
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="settle-decision"
                value="fail"
                checked={decision === "fail"}
                onChange={() => {
                  setDecision("fail");
                  setSettleError(null);
                }}
              />
              Fail
            </label>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settle-note">Note</Label>
            <Textarea
              id="settle-note"
              maxLength={SETTLE_NOTE_MAX}
              value={settleNote}
              aria-invalid={settleError !== null}
              aria-describedby="settle-note-help"
              onChange={(e) => {
                setSettleNote(e.target.value);
                setSettleError(null);
              }}
            />
            <p id="settle-note-help" className="text-xs text-neutral-500">
              Required for Fail. The student sees this note, so don't name other students.
            </p>
            {settleError && (
              <p role="alert" className="text-xs font-medium text-neutral-950">
                {settleError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeSettle}>
              Cancel
            </Button>
            <Button disabled={decision === null || settle.isPending} onClick={confirmSettle}>
              {settle.isPending && <Spinner />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
