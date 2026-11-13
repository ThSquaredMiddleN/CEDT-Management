import { zodResolver } from "@hookform/resolvers/zod";
import { Receipt } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const LIABILITY_FORM_ID = "liability-form";

const schema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "กรุณาระบุยอดเงิน" })
    .positive("ยอดเงินต้องมากกว่า 0")
    .max(1_000_000, "ยอดเงินสูงเกินไป"),
  remark: z.string().trim().min(1, "กรุณาระบุเหตุผลการปรับเงิน").max(500),
});

export type LiabilityValues = z.infer<typeof schema>;

interface LiabilityFormProps {
  onSubmit: (values: LiabilityValues) => void;
}

/** Submit button lives in the parent and targets this form via `form={LIABILITY_FORM_ID}`. */
export function LiabilityForm({ onSubmit }: LiabilityFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LiabilityValues>({ resolver: zodResolver(schema) });

  return (
    <form
      id={LIABILITY_FORM_ID}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-xl border border-status-danger-border bg-status-danger-bg p-5"
    >
      <h3 className="mb-3 flex items-center gap-2 border-b border-status-danger-border pb-2 font-body text-body-md-emphasize text-status-danger-fg">
        <Receipt className="size-5" aria-hidden="true" />
        กำหนดค่าปรับความเสียหาย (Liability)
      </h3>

      <div className="mb-4">
        <label htmlFor="fine-amount" className="mb-1 block font-body text-body-sm-emphasize text-status-danger-fg">
          ระบุยอดเงิน (บาท)
        </label>
        <Input
          id="fine-amount"
          type="number"
          inputMode="decimal"
          placeholder="เช่น 1500"
          aria-invalid={!!errors.amount}
          className="h-11 border-status-danger-border font-bold text-status-danger-fg"
          {...register("amount")}
        />
        {errors.amount && <p className="mt-1 text-xs text-status-danger-fg">{errors.amount.message}</p>}
      </div>

      <div>
        <label htmlFor="fine-remark" className="mb-1 block font-body text-body-sm-emphasize text-status-danger-fg">
          Remark เหตุผลปรับเงิน (จะส่งไปให้นิสิต)
        </label>
        <Textarea
          id="fine-remark"
          rows={2}
          placeholder="อธิบายสาเหตุสั้นๆ..."
          aria-invalid={!!errors.remark}
          className="border-status-danger-border"
          {...register("remark")}
        />
        {errors.remark && <p className="mt-1 text-xs text-status-danger-fg">{errors.remark.message}</p>}
      </div>
    </form>
  );
}
