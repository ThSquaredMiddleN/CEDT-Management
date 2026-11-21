import { useState } from "react";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentStudent, useMyPendingReturns } from "../api/hooks";
import { DueBadge } from "../components/badges";
import { useNow } from "../components/dates";
import { ItemImage } from "../components/ItemImage";
import { itemLabel } from "../components/itemLabel";

/** To-return tab: everything my groups hold, read-only in phase 1. */
export function OwedPage() {
  const owed = useMyPendingReturns();
  const me = useCurrentStudent();
  const now = useNow(60_000);
  const [groupId, setGroupId] = useState("all");

  const rows = (owed.data ?? []).filter((i) => groupId === "all" || i.groupId === groupId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="owed-group" className="text-sm font-semibold text-grey-700">กลุ่ม</label>
        <select
          id="owed-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm"
        >
          <option value="all">ทั้งหมด</option>
          {me.data?.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>

      {owed.isLoading && <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} className="h-12" />)}</div>}
      {owed.isError && <EmptyState title="โหลดรายการไม่สำเร็จ" />}
      {owed.data && rows.length === 0 && <EmptyState title="ไม่มีอุปกรณ์ที่ต้องคืน" />}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>อุปกรณ์</TableHead>
                <TableHead>กลุ่ม</TableHead>
                <TableHead>คำขอ</TableHead>
                <TableHead>กำหนดคืน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <ItemImage itemId={i.itemId} name={i.name} className="size-10" />
                      <span>
                        <span className="block font-semibold text-grey-900">{itemLabel(i)}</span>
                        {i.owedStatus === "NOT_BROUGHT" && (
                          <span className="mt-1 inline-block rounded bg-status-danger-bg px-1.5 text-[10px] font-bold text-status-danger-fg">
                            ยังไม่ได้นำมาคืน
                          </span>
                        )}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-grey-700">{i.group}</TableCell>
                  <TableCell className="font-mono text-grey-400">{i.requestId}</TableCell>
                  <TableCell>
                    <DueBadge dueAt={i.dueAt} now={now} notBrought={i.owedStatus === "NOT_BROUGHT"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
