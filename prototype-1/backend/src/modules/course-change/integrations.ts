import type { CourseChangeType } from "@prisma/client";

/**
 * Integration Layer (DESIGN.md §9). The workflow engine only ever talks to these interfaces;
 * the prototype wires in-process mocks. Real adapters require confirmed API/data contracts,
 * document transport and authorization as well as delivery outside the DB transaction;
 * these interfaces describe the demo and do not establish production compatibility.
 *
 * Production note: real network calls must move out of the DB transaction (outbox + retry).
 * The mocks are synchronous and side-effect free, so calling them inside it is safe here.
 */

export interface RegChulaAdapter {
  /** "แสดงความจำนง" — register the student's drop/withdraw intent with the central registry. */
  submitIntent(input: {
    requestNo: string;
    studentNo: string;
    courseCode: string;
    /** Null while enrollment data is synthetic; a real Reg Chula enrollment always has one. */
    section: string | null;
    requestType: CourseChangeType;
  }): Promise<{ ref: string }>;
}

export interface PiSystemAdapter {
  /** Upload the merged, signed petition to the faculty PI system. */
  uploadPetition(input: {
    requestNo: string;
    studentNo: string;
    documentHash: string;
  }): Promise<{ ref: string }>;
}

export interface LineAdapter {
  push(input: { userId: string; message: string }): Promise<{ delivered: boolean }>;
}

export interface Integrations {
  regChula: RegChulaAdapter;
  piSystem: PiSystemAdapter;
  line: LineAdapter;
}

/** Every mock call is recorded so tests (and a curious demo) can see what "went out". */
export const integrationLog: { system: keyof Integrations; input: unknown; at: Date }[] = [];

const record = (system: keyof Integrations, input: unknown) => {
  integrationLog.push({ system, input, at: new Date() });
  if (integrationLog.length > 200) integrationLog.shift();
};

export const mockIntegrations: Integrations = {
  regChula: {
    async submitIntent(input) {
      record("regChula", input);
      return { ref: `REG-${input.requestNo}` };
    },
  },
  piSystem: {
    async uploadPetition(input) {
      record("piSystem", input);
      return { ref: `PI-${input.requestNo}` };
    },
  },
  line: {
    async push(input) {
      record("line", input);
      return { delivered: true };
    },
  },
};

export const integrations: Integrations = mockIntegrations;
