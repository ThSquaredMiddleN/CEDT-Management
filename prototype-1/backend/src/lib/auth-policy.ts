export function isDevelopmentAdminBypassEnabled(
  nodeEnv: string,
  explicitlyRequested: boolean,
): boolean {
  return nodeEnv === "development" && explicitlyRequested;
}
