import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useToast } from "./toast";
import { clearSessionCache } from "./session";

/**
 * Global 401/403 handling (§4). A 401 after bootstrap means the session expired mid-use:
 * clear the cache and bounce to /login?expired=1 with a `next` back to where they were.
 * A 403 on an action is just a permission toast.
 */
export function SessionExpiryWatcher() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  useEffect(() => {
    const handle = (error: unknown) => {
      if (!(error instanceof ApiError)) return;

      if (error.status === 401 && location.pathname !== "/login") {
        clearSessionCache(qc);
        const next = encodeURIComponent(location.pathname + location.search);
        navigate(`/login?expired=1&next=${next}`, { replace: true });
        return;
      }
      if (error.status === 403) {
        toast("บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว");
      }
    };

    const unsubQueries = qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") {
        handle(event.query.state.error);
      }
    });
    const unsubMutations = qc.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation?.state.status === "error") {
        handle(event.mutation.state.error);
      }
    });

    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [qc, navigate, location, toast]);

  return null;
}
