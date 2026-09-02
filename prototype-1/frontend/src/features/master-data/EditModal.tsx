import { useState } from "react";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";

export interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  required?: boolean;
  createOnly?: boolean;
  options?: { value: string; label: string }[];
}

/** One generic modal drives create + edit for every master-data tab. */
export function EditModal({
  open,
  title,
  description,
  fields,
  initial,
  isCreate,
  isPending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  isCreate: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, unknown>, setFieldError: (msg: string) => void) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const raw = initial[f.name];
      // The course row nests its instructor; the form only wants the id.
      if (f.name === "defaultInstructorId") {
        const nested = initial.defaultInstructor as { id?: string } | null | undefined;
        out[f.name] = nested?.id ?? "";
        continue;
      }
      out[f.name] = raw === null || raw === undefined ? "" : String(raw);
    }
    return out;
  });

  const [isActive, setIsActive] = useState(initial.isActive !== false);
  const [error, setError] = useState<string | null>(null);

  const visibleFields = fields.filter((f) => !f.createOnly || isCreate);

  const submit = () => {
    setError(null);

    const missing = visibleFields.find((f) => f.required && !values[f.name]?.trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }

    const body: Record<string, unknown> = {};
    for (const f of visibleFields) {
      const raw = values[f.name] ?? "";
      if (raw === "") {
        // An empty optional select means "clear it"; skip other empty optionals entirely.
        if (f.name === "defaultInstructorId") body[f.name] = null;
        continue;
      }
      body[f.name] = f.type === "number" ? Number(raw) : raw;
    }
    if (!isCreate) body.isActive = isActive;

    onSubmit(body, setError);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {visibleFields.map((f) => (
            <div key={f.name} className="flex flex-col gap-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              {f.type === "select" ? (
                <Select
                  id={f.name}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={f.name}
                  type={f.type}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </div>
          ))}

          {!isCreate && (
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-100/30 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Active</span>
                <span className="text-xs text-neutral-500">Available in booking forms.</span>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-[#797979]/40 bg-[#797979]/10 p-3 text-xs text-[#797979]">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Spinner />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
