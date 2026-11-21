import { useCurrentStudent, useSetCurrentStudent, useStudents } from "../api/hooks";

/** Dev builds only (the parent checks import.meta.env.DEV): act as any seeded student. */
export function DevStudentSwitcher() {
  const students = useStudents();
  const me = useCurrentStudent();
  const set = useSetCurrentStudent();

  return (
    <label className="flex items-center gap-2 font-body text-body-xs text-grey-400">
      <span className="rounded bg-status-warning-bg px-1.5 py-0.5 font-bold text-status-warning-fg">DEV</span>
      นิสิต
      <select
        value={me.data?.studentId ?? ""}
        onChange={(e) => set.mutate(e.target.value)}
        disabled={set.isPending}
        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm"
      >
        {students.data?.map((s) => (
          <option key={s.studentId} value={s.studentId}>
            {s.studentId} {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
