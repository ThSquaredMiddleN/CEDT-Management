import type { QueryClient } from "@tanstack/react-query";
import { qk } from "../api/queryKeys.ts";

export function clearSessionCache(client: QueryClient) {
  // Notify the mounted session observer before removing private queries. clear() alone leaves
  // that observer displaying its last authenticated result and sends /login back to the app.
  client.setQueryData(qk.me, { user: null });
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== qk.me[0] });
  client.getMutationCache().clear();
}
