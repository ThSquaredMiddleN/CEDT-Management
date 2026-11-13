import { useEffect, useState } from "react";
import {
  useCcSettings,
  useCcSchedules,
  useSaveCcSchedule,
  type CcSchedule,
  type CcSettings,
  type CcType,
  type CcFlow,
} from "@/api/courseChange";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  PortalDialogContent,
  PortalErrorState,
  PortalEmptyState,
} from "./PortalUI";
import { SkeletonRow } from "@/components/states";
import { useToast } from "@/app/toast";
import { requestErrorMessage } from "./requestTools";
import { fmtDate, TYPE_LABEL } from "./shared";

export function SchedulesView({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const settings = useCcSettings();
  const schedules = useCcSchedules();
  const [editing, setEditing] = useState<CcSchedule | "new" | null>(null);
  const [search, setSearch] = useState("");
  if (settings.isPending || schedules.isPending)
    return <SkeletonRow className="h-48" />;
  if (settings.isError || schedules.isError)
    return (
      <PortalErrorState
        onRetry={() => {
          void settings.refetch();
          void schedules.refetch();
        }}
      />
    );
  const courses = settings.data.courses;
  const rows = schedules.data.items.filter((s) =>
    `${courses.find((c) => c.courseId === s.courseId)?.courseCode} ${s.label} ${s.section}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">กำหนดรับคำร้องรายวิชา / Block</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600">
          ตั้งวันที่ตามประกาศจริง แยกตอนเรียนและประเภทคำร้อง ไม่คำนวณ 1/3 Block
          หรือก่อน Final แทนหลักสูตร
        </p>
      </div>
      {editing ? (
        <ScheduleEditor
          key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`}
          initial={editing === "new" ? null : editing}
          settings={settings.data}
          onDirtyChange={onDirtyChange}
          close={() => setEditing(null)}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Input
              className="min-w-0 flex-1"
              aria-label="ค้นหากำหนดรายวิชา"
              placeholder="ค้นหารหัสวิชา ชื่อรอบ หรือตอนเรียน"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button onClick={() => setEditing("new")}>เพิ่มกำหนดรายวิชา</Button>
          </div>
          {!rows.length && (
            <PortalEmptyState
              title="ยังไม่มีกำหนดที่ตรงกับรายการนี้"
              description="คำร้องใหม่จะเปิดรับเมื่อมีการประกาศกำหนดที่ตรงกับรายวิชาและตอนเรียน และเปิดสิทธิ์รายวิชาไว้แล้ว"
            />
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((s) => (
              <Card key={s.id} className="flex min-w-0 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {
                        courses.find((c) => c.courseId === s.courseId)
                          ?.courseCode
                      }{" "}
                      · {TYPE_LABEL[s.requestType]}
                    </p>
                    <p className="mt-1 break-words text-sm">{s.label}</p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs">
                    {s.published ? "ประกาศแล้ว" : "ฉบับร่าง"}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  {s.format === "block" ? "Block" : "เต็มภาค"} · ตอนเรียน{" "}
                  {s.section === "*" ? "ทุกตอนที่ไม่มีกำหนดเฉพาะ" : s.section}
                </p>
                <p className="text-sm">
                  {fmtDate(s.opensOn)}–{fmtDate(s.closesOn)}
                </p>
                <p className="text-xs text-neutral-600">
                  เจ้าหน้าที่ตรวจ → {s.needsSignature ? "ลงนาม → " : ""}
                  {s.flow === "program_registrar"
                    ? "หลักสูตรส่ง สนท."
                    : [
                        s.needsReg ? "นิสิตทำ Reg Chula" : "",
                        s.needsPi ? "นิสิตส่ง PI" : "",
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                </p>
                <Button variant="outline" onClick={() => setEditing(s)}>
                  แก้ไขกำหนด / หยุดประกาศ
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ScheduleEditor({
  initial,
  settings,
  onDirtyChange,
  close,
}: {
  initial: CcSchedule | null;
  settings: CcSettings;
  onDirtyChange: (dirty: boolean) => void;
  close: () => void;
}) {
  const defaults = {
    id: initial?.id,
    revision: initial?.revision ?? 0,
    termId: settings.term.id,
    courseId: initial?.courseId ?? settings.courses[0]?.courseId ?? "",
    section: initial?.section ?? "*",
    requestType: initial?.requestType ?? ("withdraw" as CcType),
    label: initial?.label ?? "",
    format: initial?.format ?? "block",
    opensOn: initial?.opensOn ?? "",
    closesOn: initial?.closesOn ?? "",
    finalOn: initial?.finalOn ?? null,
    teachingStartsOn: initial?.teachingStartsOn ?? null,
    teachingEndsOn: initial?.teachingEndsOn ?? null,
    flow: initial?.flow ?? ("advisor_pi" as CcFlow),
    needsSignature: initial?.needsSignature ?? true,
    needsReg: initial?.needsReg ?? false,
    needsPi: initial?.needsPi ?? false,
    needsMerge: initial?.needsMerge ?? false,
    published: initial?.published ?? false,
  };
  const [value, setValue] = useState(defaults);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState("");
  const save = useSaveCcSchedule();
  const toast = useToast();
  const dirty = JSON.stringify(value) !== JSON.stringify(defaults) || !!reason;
  useEffect(() => {
    onDirtyChange(dirty);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (dirty) window.addEventListener("beforeunload", warn);
    return () => {
      onDirtyChange(false);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, onDirtyChange]);
  const update = <K extends keyof typeof value>(
    key: K,
    next: (typeof value)[K],
  ) => setValue((prev) => ({ ...prev, [key]: next }));
  const invalid =
    !value.courseId ||
    value.label.trim().length < 3 ||
    !value.opensOn ||
    !value.closesOn ||
    value.opensOn > value.closesOn ||
    !value.section.trim() ||
    reason.trim().length < 5;
  return (
    <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <h3 className="font-medium">
        {initial ? "แก้ไขกำหนดรายวิชา" : "กำหนดใหม่ · เริ่มเป็นฉบับร่าง"}
      </h3>
      <p className="text-xs leading-relaxed text-neutral-600">
        กำหนดเฉพาะตอนเรียนจะมีลำดับเหนือ “ทุกตอน”
        แม้ช่วงเฉพาะนั้นจะยังไม่เปิดหรือปิดแล้ว วันปิดรับสิ้นสุดเวลา 23:59 น.
        ไทย คำร้องเดิมเก็บกำหนดและขั้นตอนเดิมไว้
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          รายวิชา
          <select
            className="h-10 min-w-0 rounded-md border bg-white px-2 text-sm"
            value={value.courseId}
            disabled={save.isPending}
            onChange={(e) => update("courseId", e.target.value)}
          >
            {settings.courses
              .filter((c) => c.isActive)
              .map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.courseCode} {c.courseName}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ตอนเรียน (* = ทุกตอน)
          <Input
            maxLength={30}
            value={value.section}
            disabled={save.isPending}
            onChange={(e) => update("section", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ประเภทคำร้อง
          <select
            className="h-10 rounded-md border bg-white px-2"
            value={value.requestType}
            disabled={save.isPending}
            onChange={(e) => update("requestType", e.target.value as CcType)}
          >
            <option value="drop">ลดรายวิชา</option>
            <option value="withdraw">ถอนรายวิชา</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          รูปแบบรายวิชา
          <select
            className="h-10 rounded-md border bg-white px-2"
            value={value.format}
            disabled={save.isPending}
            onChange={(e) => update("format", e.target.value)}
          >
            <option value="block">Block Course</option>
            <option value="full_term">เต็มภาคการศึกษา</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          ชื่อรอบ / ข้อความประกาศ
          <Input
            maxLength={150}
            placeholder="เช่น ถอน Block ครึ่งเทอมแรก ตามประกาศหลักสูตร"
            value={value.label}
            disabled={save.isPending}
            onChange={(e) => update("label", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          วันเปิดรับ
          <Input
            type="date"
            value={value.opensOn}
            disabled={save.isPending}
            onChange={(e) => update("opensOn", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          วันปิดรับ
          <Input
            type="date"
            value={value.closesOn}
            disabled={save.isPending}
            onChange={(e) => update("closesOn", e.target.value)}
          />
        </label>
        {(
          [
            { key: "teachingStartsOn", label: "วันเริ่มช่วงเรียน (ถ้าทราบ)" },
            { key: "teachingEndsOn", label: "วันสิ้นสุดช่วงเรียน (ถ้าทราบ)" },
          ] as const
        ).map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            {field.label}
            <Input
              type="date"
              value={value[field.key] ?? ""}
              disabled={save.isPending}
              onChange={(e) => update(field.key, e.target.value || null)}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm">
          วันสอบ Final (ถ้าทราบ)
          <Input
            type="date"
            value={value.finalOn ?? ""}
            disabled={save.isPending}
            onChange={(e) => update("finalOn", e.target.value || null)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ผู้ดำเนินการหลังตรวจ / ลงนาม
          <select
            className="h-10 rounded-md border bg-white px-2"
            value={value.flow}
            disabled={save.isPending}
            onChange={(e) => {
              const flow = e.target.value as CcFlow;
              setValue((prev) => ({
                ...prev,
                flow,
                ...(flow === "program_registrar"
                  ? { needsReg: false, needsPi: false, needsMerge: false }
                  : {}),
              }));
            }}
          >
            <option value="reg_direct">นิสิตทำ Reg Chula</option>
            <option value="advisor_pi">นิสิตทำตามรายการ Reg / PI</option>
            <option value="program_registrar">หลักสูตรรวบรวมส่ง สนท.</option>
          </select>
        </label>
      </div>
      <fieldset
        disabled={save.isPending}
        className="flex flex-col gap-3 rounded-lg border p-4"
      >
        <legend className="px-1 text-sm font-medium">
          งานที่ต้องทำตามประกาศของรอบนี้
        </legend>
        {(
          [
            {
              key: "needsSignature",
              label: "ต้องมีคำร้องที่อาจารย์ / ผู้เกี่ยวข้องลงนาม",
            },
            ...(value.flow !== "program_registrar"
              ? [
                  { key: "needsReg", label: "นิสิตต้องดำเนินการใน Reg Chula" },
                  { key: "needsPi", label: "นิสิตต้องส่ง PI" },
                  {
                    key: "needsMerge",
                    label: "ต้องรวมคำร้องลงนาม + เอกสาร Reg Chula สองฉบับ",
                  },
                ]
              : []),
          ] as {
            key: "needsSignature" | "needsReg" | "needsPi" | "needsMerge";
            label: string;
          }[]
        ).map((item) => (
          <label key={item.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-neutral-900"
              checked={value[item.key]}
              onChange={(e) => update(item.key, e.target.checked)}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        เหตุผล / อ้างอิงประกาศ (อย่างน้อย 5 ตัวอักษร)
        <Textarea
          rows={2}
          maxLength={500}
          value={reason}
          disabled={save.isPending}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-neutral-900"
          checked={value.published}
          disabled={save.isPending}
          onChange={(e) => update("published", e.target.checked)}
        />
        ประกาศใช้งานสำหรับคำร้องใหม่ — ยืนยันวันและขั้นตอนตามประกาศแล้ว
      </label>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => (dirty ? setDiscard(true) : close())}
        >
          กลับรายการ
        </Button>
        <Button
          disabled={invalid || save.isPending}
          onClick={() => {
            setError("");
            setConfirm(true);
          }}
        >
          ตรวจสอบก่อนบันทึก
        </Button>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!save.isPending) setConfirm(open);
        }}
      >
        <PortalDialogContent busy={save.isPending}>
          <DialogHeader>
            <DialogTitle>
              {value.published
                ? "ยืนยันประกาศกำหนดรายวิชา"
                : "บันทึกเป็นฉบับร่าง / หยุดประกาศ"}
            </DialogTitle>
            <DialogDescription>
              มีผลกับการยื่นใหม่ คำร้องเดิมไม่เปลี่ยนขั้นตอนย้อนหลัง
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              {
                settings.courses.find((c) => c.courseId === value.courseId)
                  ?.courseCode
              }{" "}
              · ตอน {value.section} · {TYPE_LABEL[value.requestType]}
            </p>
            <p>{value.label}</p>
            <p>
              {fmtDate(value.opensOn)}–{fmtDate(value.closesOn)} เวลา 23:59 น.
              ไทย
            </p>
            <p>
              เจ้าหน้าที่ตรวจ → {value.needsSignature ? "ลงนาม → " : ""}
              {value.flow === "program_registrar"
                ? "หลักสูตรส่ง สนท."
                : [value.needsReg ? "Reg Chula" : "", value.needsPi ? "PI" : ""]
                    .filter(Boolean)
                    .join(" / ")}
            </p>
            <p>
              {value.needsMerge ? "รวมเอกสารสองฉบับ" : "ไม่มีขั้นรวมสองฉบับ"}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <DialogFooter className="cc-dialog-actions">
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setConfirm(false)}
            >
              กลับไปแก้ไข
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { ...value, reason },
                  {
                    onSuccess: () => {
                      toast("บันทึกกำหนดรายวิชาแล้ว");
                      close();
                    },
                    onError: (e) =>
                      setError(
                        requestErrorMessage(e, "บันทึกไม่สำเร็จ กรุณาลองใหม่"),
                      ),
                  },
                )
              }
            >
              {save.isPending ? "กำลังบันทึก…" : "ยืนยันบันทึก"}
            </Button>
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
      <Dialog open={discard} onOpenChange={setDiscard}>
        <PortalDialogContent>
          <DialogHeader>
            <DialogTitle>ทิ้งการแก้ไขกำหนดนี้?</DialogTitle>
            <DialogDescription>
              ข้อมูลที่ยังไม่บันทึกจะไม่ถูกประกาศ
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              แก้ไขต่อ
            </Button>
            <Button onClick={close}>ทิ้งการแก้ไข</Button>
          </DialogFooter>
        </PortalDialogContent>
      </Dialog>
    </Card>
  );
}
