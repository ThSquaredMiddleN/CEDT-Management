type WithPermissions = { permissions: readonly string[] } | null | undefined;

/** Same rule as the backend's can(): exact name, no hierarchy. Hides pages only; the API enforces. */
export const can = (user: WithPermissions, permission: string): boolean =>
  !!user && user.permissions.includes(permission);

/** /admin opens for anyone who can view at least one module's staff pages (shared plan 2.5). */
export const isStaff = (user: WithPermissions): boolean =>
  !!user && user.permissions.some((p) => p.endsWith(".view"));
