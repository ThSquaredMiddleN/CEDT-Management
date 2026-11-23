import { it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { clearSessionCache } from "../src/app/session.ts";

it("notifies an active session observer on sign-out and clears other account data", async () => {
  const client = new QueryClient();
  client.setQueryData(["me"], {user:{id:'old-account'}});
  client.setQueryData(["course-change","requests"], {items:['private-old-request']});
  const observer = new QueryObserver(client, {queryKey:['me'],queryFn:async()=>({user:null}),staleTime:Infinity});
  const unsubscribe = observer.subscribe(()=>{});
  try {
    clearSessionCache(client);
    await new Promise((resolve)=>setTimeout(resolve,0));
    assert.equal(observer.getCurrentResult().data?.user, null);
    assert.equal(client.getQueryData(['course-change','requests']), undefined);
  } finally { unsubscribe(); client.clear(); }
});
