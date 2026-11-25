import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/auth.js";
import { addItem, listCatalog, listItems } from "./inventory.js";
import { getQc, listQc, submitQc, verifySlip } from "./qc.js";
import {
  cancelMyRequest, createRequest, getMe, getRequest, issueRequest, listMyRequests, listRequests, lookupStudent,
  pickupMyRequest, rejectRequest, reopenMyRequest, setDue, staffPickup, walkIn,
} from "./requests.js";
import { listMyOwed, listStudentOwed, submitReturn } from "./returns.js";
import {
  addItemBody, createRequestBody, dueBody, idParam, issueBody, qcSubmitBody, rejectBody, returnBody,
  settingsDueBody, studentNoParam, verifyBody, walkInBody,
} from "./schemas.js";
import { getSettings, setDefaultDue } from "./settings.js";

const use = { auth: "user", permission: "storage.use" } as const;
const view = { auth: "user", permission: "storage.view" } as const;
const counter = { auth: "user", permission: "storage.manage.counter" } as const;
const qc = { auth: "user", permission: "storage.manage.qc" } as const;
const inventory = { auth: "user", permission: "storage.manage.inventory" } as const;
const payment = { auth: "user", permission: "storage.manage.payment" } as const;

/** Registered under /api/v1/storage. Spec §5. */
export async function storageRoutes(app: FastifyInstance): Promise<void> {
  // ---- Student (storage.use)
  app.get("/catalog", { config: use }, async () => listCatalog());
  app.get("/me", { config: use }, async (req) => getMe(requireUser(req)));
  app.get("/my/requests", { config: use }, async (req) => listMyRequests(requireUser(req)));
  app.post("/my/requests", { config: use }, async (req, reply) =>
    reply.code(201).send(await createRequest(requireUser(req), createRequestBody.parse(req.body))),
  );
  app.post("/my/requests/:id/cancel", { config: use }, async (req) => cancelMyRequest(requireUser(req), idParam.parse(req.params).id));
  app.post("/my/requests/:id/reopen", { config: use }, async (req) => reopenMyRequest(requireUser(req), idParam.parse(req.params).id));
  app.post("/my/requests/:id/pickup", { config: use }, async (req) => pickupMyRequest(requireUser(req), idParam.parse(req.params).id));
  app.get("/my/owed", { config: use }, async (req) => listMyOwed(requireUser(req)));

  // ---- Staff
  app.get("/items", { config: view }, async () => listItems());
  app.post("/items", { config: inventory }, async (req, reply) =>
    reply.code(201).send(await addItem(requireUser(req).id, addItemBody.parse(req.body))),
  );
  app.get("/requests", { config: view }, async () => listRequests());
  app.get("/requests/:id", { config: view }, async (req) => getRequest(idParam.parse(req.params).id));
  app.post("/requests/:id/issue", { config: counter }, async (req) => {
    const body = issueBody.parse(req.body);
    return issueRequest(requireUser(req).id, idParam.parse(req.params).id, body.lines, body.pickup);
  });
  app.post("/requests/:id/reject", { config: counter }, async (req) =>
    rejectRequest(requireUser(req).id, idParam.parse(req.params).id, rejectBody.parse(req.body).reason),
  );
  app.post("/requests/:id/pickup", { config: counter }, async (req) => staffPickup(requireUser(req).id, idParam.parse(req.params).id));
  app.put("/requests/:id/due", { config: counter }, async (req) =>
    setDue(requireUser(req).id, idParam.parse(req.params).id, dueBody.parse(req.body).dueAt),
  );
  app.get("/students/:studentNo", { config: counter }, async (req) => lookupStudent(studentNoParam.parse(req.params).studentNo));
  app.get("/students/:studentNo/owed", { config: counter }, async (req) => listStudentOwed(studentNoParam.parse(req.params).studentNo));
  app.post("/walk-in", { config: counter }, async (req) => walkIn(requireUser(req).id, walkInBody.parse(req.body)));
  app.post("/returns", { config: counter }, async (req) => submitReturn(requireUser(req).id, returnBody.parse(req.body)));
  app.get("/qc", { config: view }, async () => listQc());
  app.get("/qc/:id", { config: view }, async (req) => getQc(idParam.parse(req.params).id));
  app.post("/qc/:id/submit", { config: qc }, async (req) => submitQc(requireUser(req).id, idParam.parse(req.params).id, qcSubmitBody.parse(req.body)));
  app.post("/qc/:id/verify-slip", { config: payment }, async (req) =>
    verifySlip(requireUser(req).id, idParam.parse(req.params).id, verifyBody.parse(req.body).valid),
  );
  app.get("/settings", { config: view }, async () => getSettings());
  app.put("/settings/default-due", { config: inventory }, async (req) =>
    setDefaultDue(requireUser(req).id, settingsDueBody.parse(req.body).defaultDueAt),
  );
}
