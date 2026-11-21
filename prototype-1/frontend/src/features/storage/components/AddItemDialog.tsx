import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { cn } from "@/lib/utils";
import { useAddInventoryItem } from "../api/hooks";
import { IMAGE_ACCEPT, readItemImage } from "./imageFile";
import { ItemImage } from "./ItemImage";

const schema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "กรุณาระบุรหัสอุปกรณ์")
    .max(32, "รหัสยาวเกินไป")
    .regex(/^[A-Za-z0-9-]+$/, "ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ -"),
  name: z.string().trim().min(1, "กรุณาระบุชื่ออุปกรณ์").max(100),
  type: z.enum(["UNIQUE", "BULK"]),
  total: z.coerce
    .number({ invalid_type_error: "กรุณาระบุจำนวน" })
    .int("จำนวนต้องเป็นจำนวนเต็ม")
    .min(1, "ต้องมีอย่างน้อย 1 ชิ้น")
    .max(100000, "จำนวนสูงเกินไป"),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-body text-body-sm-emphasize text-grey-700">
        {label} <span className="text-status-danger-fg">*</span>
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-status-danger-fg">{error}</p>}
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: "UNIQUE", title: "Unique", hint: "ติดตามราย Serial Number" },
  { value: "BULK", title: "Bulk", hint: "นับเป็นจำนวนรวม" },
] as const;

export function AddItemDialog() {
  const [open, setOpen] = useState(false);
  const add = useAddInventoryItem();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { id: "", name: "", type: "UNIQUE", total: 1 },
  });
  const type = watch("type");

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      add.reset();
      setImageUrl(undefined);
      setImageError(null);
    }
  };

  const onSubmit = handleSubmit((v) =>
    add.mutate(
      { id: v.id, name: v.name, isUnique: v.type === "UNIQUE", total: v.total, imageUrl },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <>
      <Button variant="filled" size="medium" icon={<Plus />} iconPosition="start" onClick={() => setOpen(true)}>
        เพิ่มอุปกรณ์
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มอุปกรณ์ใหม่</DialogTitle>
            <DialogDescription>
              อุปกรณ์ทุกชิ้นที่เพิ่มจะเริ่มต้นในสถานะพร้อมจ่าย (Available)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field id="item-id" label="รหัสอุปกรณ์ / บาร์โค้ด" error={errors.id?.message}>
              <Input id="item-id" placeholder="เช่น EQ-005" aria-invalid={!!errors.id} {...register("id")} />
            </Field>

            <Field id="item-name" label="ชื่ออุปกรณ์" error={errors.name?.message}>
              <Input
                id="item-name"
                placeholder="เช่น Arduino Uno R3"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
            </Field>

            <fieldset>
              <legend className="mb-1 font-body text-body-sm-emphasize text-grey-700">
                ประเภท Index <span className="text-status-danger-fg">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      "cursor-pointer rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-brand-primary",
                      type === o.value
                        ? "border-brand-primary bg-status-info-bg"
                        : "border-neutral-200 hover:bg-neutral-50",
                    )}
                  >
                    <input type="radio" value={o.value} className="sr-only" {...register("type")} />
                    <span className="block font-body text-body-sm-emphasize text-grey-900">{o.title}</span>
                    <span className="block font-body text-body-xs text-grey-400">{o.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <span className="mb-1 block font-body text-body-sm-emphasize text-grey-700">รูปอุปกรณ์ (ไม่บังคับ)</span>
              <div className="flex items-center gap-3">
                <ItemImage src={imageUrl} name="ตัวอย่างรูปอุปกรณ์" className="size-16" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    {imageUrl ? "เปลี่ยนรูป" : "เลือกรูป"}
                  </Button>
                  {imageUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl(undefined)}>
                      ลบรูป
                    </Button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="sr-only"
                  aria-label="เลือกไฟล์รูปอุปกรณ์"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // allow re-picking the same file
                    if (!file) return;
                    try {
                      setImageUrl(await readItemImage(file));
                      setImageError(null);
                    } catch (err) {
                      setImageError((err as Error).message);
                    }
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-grey-400">JPG, PNG หรือ WebP ไม่เกิน 2 MB</p>
              {imageError && <p role="alert" className="mt-1 text-xs text-status-danger-fg">{imageError}</p>}
            </div>

            <Field id="item-total" label="จำนวนทั้งหมด (ชิ้น)" error={errors.total?.message}>
              <Input
                id="item-total"
                type="number"
                inputMode="numeric"
                min={1}
                aria-invalid={!!errors.total}
                {...register("total")}
              />
            </Field>

            {add.isError && (
              <p role="alert" className="text-sm text-status-danger-fg">
                {(add.error as Error).message}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="filled" size="medium" className="px-6" loading={add.isPending}>
                บันทึก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
