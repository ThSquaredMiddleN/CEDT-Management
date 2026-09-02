import { BookOpen, Building2, CalendarRange, DoorOpen, Pencil, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import {
  useBuildings,
  useCourses,
  useResourceMutation,
  useRooms,
  useTerms,
  useUsers,
} from "@/api/endpoints";
import type { AffectedBooking } from "@/api/types";
import { useToast } from "@/app/toast";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EditModal, type FieldSpec } from "./EditModal";

type TabKey = "courses" | "rooms" | "buildings" | "users" | "terms";

const TABS: { key: TabKey; label: string; icon: typeof BookOpen; description: string }[] = [
  {
    key: "courses",
    label: "Courses",
    icon: BookOpen,
    description: "Manage course codes, names and default instructors.",
  },
  {
    key: "rooms",
    label: "Rooms",
    icon: DoorOpen,
    description: "Manage bookable rooms, capacity and equipment.",
  },
  {
    key: "buildings",
    label: "Buildings",
    icon: Building2,
    description: "Manage buildings that contain bookable rooms.",
  },
  {
    key: "users",
    label: "Instructors/Users",
    icon: Users,
    description: "Provision accounts. There is no self-signup.",
  },
  {
    key: "terms",
    label: "Terms",
    icon: CalendarRange,
    description: "Academic terms. Exactly one term is active at a time.",
  },
];

interface RowLike {
  id: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export function MasterDataPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const tab = (params.get("tab") as TabKey) ?? "courses";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RowLike | null>(null);
  const [creating, setCreating] = useState(false);

  // The warn-and-confirm payload returned by a 409 NEEDS_CONFIRM deactivation.
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    row: RowLike;
    affected: AffectedBooking[];
  } | null>(null);

  const courses = useCourses({ active: "all" });
  const rooms = useRooms();
  const buildings = useBuildings();
  const users = useUsers();
  const terms = useTerms();

  const activeInstructors = useUsers({ role: "staff", active: "true" });

  const resource: Record<TabKey, string> = {
    courses: "courses",
    rooms: "rooms",
    buildings: "buildings",
    users: "users",
    terms: "terms",
  };

  const mutate = useResourceMutation(resource[tab]);

  const query = {
    courses,
    rooms,
    buildings,
    users,
    terms,
  }[tab];

  const rows = useMemo(() => {
    const items = (query.data?.items ?? []) as unknown as RowLike[];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((r) =>
      Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(q)),
    );
  }, [query.data, search]);

  const spec = TABS.find((t) => t.key === tab)!;

  /** Toggling Active off is a soft delete — the server may demand confirmation first (BR-14). */
  const toggleActive = (row: RowLike, next: boolean) => {
    mutate.mutate(
      { id: row.id, body: { isActive: next } },
      {
        onSuccess: () => toast(next ? "Activated" : "Deactivated"),
        onError: (e) => {
          if (e instanceof ApiError && e.code === "NEEDS_CONFIRM") {
            setConfirmDeactivate({ row, affected: (e.details as AffectedBooking[]) ?? [] });
            return;
          }
          toast("Could not update that record.");
        },
      },
    );
  };

  const forceDeactivate = () => {
    if (!confirmDeactivate) return;
    mutate.mutate(
      { id: confirmDeactivate.row.id, body: { isActive: false, confirm: true } },
      {
        onSuccess: () => {
          toast("Deactivated — existing bookings are untouched");
          setConfirmDeactivate(null);
        },
        onError: () => toast("Could not deactivate."),
      },
    );
  };

  const instructorOptions = (activeInstructors.data?.items ?? []).map((u) => ({
    value: u.id,
    label: [u.titlePrefix, u.name].filter(Boolean).join(" "),
  }));

  const buildingOptions = (buildings.data?.items ?? []).map((b) => ({
    value: b.id,
    label: `${b.code} — ${b.name}`,
  }));

  // Field specs drive both the create and edit modals for every tab.
  const FIELDS: Record<TabKey, FieldSpec[]> = {
    courses: [
      { name: "code", label: "Course Code", type: "text", required: true },
      { name: "name", label: "Course Name", type: "text", required: true },
      {
        name: "defaultInstructorId",
        label: "Default Instructor",
        type: "select",
        options: [{ value: "", label: "— None —" }, ...instructorOptions],
      },
    ],
    rooms: [
      { name: "name", label: "Room Name", type: "text", required: true },
      { name: "buildingId", label: "Building", type: "select", options: buildingOptions, required: true },
      { name: "capacity", label: "Capacity", type: "number", required: true },
      {
        name: "roomType",
        label: "Type",
        type: "select",
        required: true,
        options: [
          { value: "lecture", label: "Lecture" },
          { value: "lab", label: "Lab" },
          { value: "hardware", label: "Hardware" },
          { value: "meeting", label: "Meeting" },
        ],
      },
    ],
    buildings: [
      { name: "code", label: "Building Code", type: "text", required: true },
      { name: "name", label: "Building Name", type: "text", required: true },
    ],
    // Single `staff` role: no role picker — new accounts default to staff on the backend.
    users: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "titlePrefix", label: "Title", type: "text" },
      { name: "email", label: "Email", type: "text", required: true },
      { name: "password", label: "Temporary Password", type: "text", createOnly: true, required: true },
    ],
    terms: [
      { name: "academicYear", label: "Academic Year", type: "number", required: true },
      { name: "termNumber", label: "Term Number", type: "number", required: true },
      { name: "startDate", label: "Start Date", type: "date", required: true },
      { name: "endDate", label: "End Date", type: "date", required: true },
    ],
  };

  return (
    <>
      <div className="border-b border-neutral-200 px-8">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={cn(
                "flex items-center gap-2 border-b-2 py-3 text-sm transition-colors",
                tab === t.key
                  ? "border-neutral-950 font-medium text-neutral-950"
                  : "border-transparent text-neutral-500 hover:text-neutral-950",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex flex-col gap-6 p-8">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{spec.label}</h1>
            <p className="text-sm text-neutral-500">{spec.description}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-9"
              />
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          {query.isPending ? (
            <div className="flex flex-col gap-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} className="h-8" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing here yet."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Add
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {tab === "courses" && (
                    <>
                      <TableHead className="pl-6">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Default Instructor</TableHead>
                    </>
                  )}
                  {tab === "rooms" && (
                    <>
                      <TableHead className="pl-6">Name</TableHead>
                      <TableHead>Building</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Type</TableHead>
                    </>
                  )}
                  {tab === "buildings" && (
                    <>
                      <TableHead className="pl-6">Code</TableHead>
                      <TableHead>Name</TableHead>
                    </>
                  )}
                  {tab === "users" && (
                    <>
                      <TableHead className="pl-6">Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                    </>
                  )}
                  {tab === "terms" && (
                    <>
                      <TableHead className="pl-6">Year</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Dates</TableHead>
                    </>
                  )}
                  <TableHead>Active</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row.id} className={cn(i % 2 === 1 && "bg-neutral-100/50")}>
                    {tab === "courses" && (
                      <>
                        <TableCell className="pl-6 font-semibold">{String(row.code)}</TableCell>
                        <TableCell>{String(row.name)}</TableCell>
                        <TableCell className="text-neutral-500">
                          {(row.defaultInstructor as { name?: string } | null)?.name ?? "—"}
                        </TableCell>
                      </>
                    )}
                    {tab === "rooms" && (
                      <>
                        <TableCell className="pl-6 font-semibold">{String(row.name)}</TableCell>
                        <TableCell>{String(row.buildingCode)}</TableCell>
                        <TableCell>{String(row.capacity)}</TableCell>
                        <TableCell className="capitalize text-neutral-500">
                          {String(row.roomType)}
                        </TableCell>
                      </>
                    )}
                    {tab === "buildings" && (
                      <>
                        <TableCell className="pl-6 font-semibold">{String(row.code)}</TableCell>
                        <TableCell>{String(row.name)}</TableCell>
                      </>
                    )}
                    {tab === "users" && (
                      <>
                        <TableCell className="pl-6 font-semibold">
                          {[row.titlePrefix, row.name].filter(Boolean).join(" ")}
                        </TableCell>
                        <TableCell className="text-neutral-500">{String(row.email ?? "")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize font-normal">
                            {String(row.role ?? "")}
                          </Badge>
                        </TableCell>
                      </>
                    )}
                    {tab === "terms" && (
                      <>
                        <TableCell className="pl-6 font-semibold">
                          {String(row.academicYear)}
                        </TableCell>
                        <TableCell>{String(row.termNumber)}</TableCell>
                        <TableCell className="text-neutral-500">
                          {String(row.startDate)} – {String(row.endDate)}
                        </TableCell>
                      </>
                    )}

                    <TableCell>
                      <Switch
                        checked={row.isActive !== false}
                        onCheckedChange={(next) => toggleActive(row, next)}
                      />
                    </TableCell>

                    <TableCell className="pr-6 text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>

      {(editing || creating) && (
        <EditModal
          open
          title={`${editing ? "Edit" : "Add"} ${spec.label.replace(/s$/, "")}`}
          description={
            editing ? "Update the details below." : "Create a new record. It becomes available immediately."
          }
          fields={FIELDS[tab]}
          isCreate={creating}
          initial={editing ?? {}}
          isPending={mutate.isPending}
          onOpenChange={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(values, setFieldError) => {
            mutate.mutate(
              { id: editing?.id, body: values },
              {
                onSuccess: () => {
                  toast(editing ? "Saved" : "Created");
                  setEditing(null);
                  setCreating(false);
                },
                onError: (e) => {
                  // A duplicate key is a field error inside the still-open modal, not a toast.
                  if (e instanceof ApiError && e.code === "DUPLICATE") {
                    setFieldError(e.message);
                    return;
                  }
                  toast("Could not save that record.");
                },
              },
            );
          }}
        />
      )}

      <Dialog
        open={!!confirmDeactivate}
        onOpenChange={(open) => !open && setConfirmDeactivate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This record is in use</DialogTitle>
            <DialogDescription>
              It is referenced by {confirmDeactivate?.affected.length ?? 0} future approved booking
              {(confirmDeactivate?.affected.length ?? 0) === 1 ? "" : "s"}. Deactivating hides it
              from booking forms; existing bookings keep it.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-2">
            {(confirmDeactivate?.affected ?? []).map((a) => (
              <li
                key={a.bookingId}
                className="rounded-lg border border-neutral-200 bg-neutral-100/50 p-3 text-xs"
              >
                <span className="font-semibold">{a.requestNo}</span> · {a.courseCode ?? a.title} ·{" "}
                {a.roomName} · next {a.nextDate} {a.startTime}–{a.endTime}
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>
              Keep active
            </Button>
            <Button onClick={forceDeactivate} disabled={mutate.isPending}>
              Deactivate anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
