import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface CatalogCell { key: string; label: string }
export interface CatalogRow {
  row: string;
  label: string;
  use?: CatalogCell;
  view?: CatalogCell;
  manage?: { key: string | null; label: string | null; parts: CatalogCell[] };
}
export interface AccessUserHit { id: string; name: string; email: string; studentNo: string | null; isActive: boolean; roles: string[] }
export interface UserAccessView {
  user: { id: string; name: string; email: string; studentNo: string | null; isActive: boolean };
  roles: { id: string; key: string; name: string; isActive: boolean }[];
  direct: { permission: string; reason: string; grantedBy: string | null; createdAt: string }[];
  /** sources: role names, "direct", or "student" (the automatic role). */
  effective: { permission: string; sources: string[] }[];
}
export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  userCount: number;
}
export interface RoleDetail extends RoleView { members: { id: string; name: string; email: string }[] }

const keys = {
  catalog: ["access", "catalog"] as const,
  search: (q: string) => ["access", "users", q] as const,
  user: (id: string) => ["access", "user", id] as const,
  roles: ["access", "roles"] as const,
  role: (id: string) => ["access", "role", id] as const,
};

export const useAccessCatalog = () =>
  useQuery({ queryKey: keys.catalog, queryFn: () => api<{ rows: CatalogRow[] }>("/access/catalog"), staleTime: Infinity });

export const useAccessUserSearch = (q: string) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: () => api<{ items: AccessUserHit[] }>(`/access/users?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });

export const useUserAccess = (id: string | null) =>
  useQuery({ queryKey: keys.user(id ?? ""), queryFn: () => api<UserAccessView>(`/access/users/${id}`), enabled: !!id });

export const useRoles = () => useQuery({ queryKey: keys.roles, queryFn: () => api<{ items: RoleView[] }>("/access/roles") });

export const useRole = (id: string | null) =>
  useQuery({ queryKey: keys.role(id ?? ""), queryFn: () => api<RoleDetail>(`/access/roles/${id}`), enabled: !!id });

export function useSaveUserAccess(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { roleIds: string[]; permissions: string[]; reason: string | null }) =>
      api<UserAccessView>(`/access/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(keys.user(id), data);
      void qc.invalidateQueries({ queryKey: ["access", "users"] });
      void qc.invalidateQueries({ queryKey: keys.roles });
    },
  });
}

export function useSaveRole(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key?: string; name: string; description: string | null; permissions: string[]; isActive?: boolean; reason: string }) =>
      id
        ? api<RoleView>(`/access/roles/${id}`, { method: "PUT", body: JSON.stringify(body) })
        : api<RoleView>("/access/roles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["access"] }),
  });
}
