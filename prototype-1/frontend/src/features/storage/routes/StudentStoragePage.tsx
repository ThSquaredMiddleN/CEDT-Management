import { useSearchParams } from "react-router-dom";
import { useCurrentStudent, useMyPendingReturns, useMyRequests } from "../api/hooks";
import { DevStudentSwitcher } from "../components/DevStudentSwitcher";
import { StoragePage } from "../components/layout";
import { RestockBanner } from "../components/RestockBanner";
import { Tabs } from "../components/Tabs";
import { CatalogPage } from "./CatalogPage";
import { MyRequestsPage } from "./MyRequestsPage";
import { OwedPage } from "./OwedPage";

const TABS = ["borrow", "requests", "owed"] as const;
type TabValue = (typeof TABS)[number];

/** /student/storage?tab=borrow|requests|owed&id=<requestId> */
export function StudentStoragePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabValue = TABS.includes(raw as TabValue) ? (raw as TabValue) : "borrow";
  const selectedId = params.get("id");

  const me = useCurrentStudent();
  const currentStudentId = me.data?.studentId ?? "";
  const requests = useMyRequests();
  const owed = useMyPendingReturns();

  const go = (next: TabValue, id?: string) => setParams(id ? { tab: next, id } : { tab: next });
  const needsAttention = (requests.data ?? []).filter(
    (r) => r.status === "READY_FOR_PICKUP" || (r.status === "UNFULFILLED" && !!r.restock && r.restock.expiresAt > Date.now()),
  ).length;

  return (
    <StoragePage wide title="คลังอุปกรณ์" subtitle="ยืมอุปกรณ์ ติดตามคำขอ และดูรายการที่ต้องคืน">
      {import.meta.env.DEV && (
        <div className="flex justify-end">
          <DevStudentSwitcher />
        </div>
      )}
      <RestockBanner requests={requests.data ?? []} />
      <Tabs
        label="เมนูคลังอุปกรณ์"
        value={tab}
        onChange={(v) => go(v)}
        items={[
          { value: "borrow", label: "ยืมอุปกรณ์" },
          { value: "requests", label: "คำขอของฉัน", count: needsAttention },
          { value: "owed", label: "ที่ต้องคืน", count: owed.data?.length },
        ]}
      />
      {tab === "borrow" && (
        <CatalogPage key={currentStudentId} onSubmitted={(id) => go("requests", id)} />
      )}
      {tab === "requests" && (
        <MyRequestsPage
          requests={requests.data ?? []}
          isLoading={requests.isLoading}
          isError={requests.isError}
          selectedId={selectedId}
          onSelect={(id) => go("requests", id)}
        />
      )}
      {tab === "owed" && <OwedPage key={currentStudentId} />}
    </StoragePage>
  );
}
