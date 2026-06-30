import { CONTRACT_VERSION } from "@protovault/contracts";

export interface ServiceHealth {
  status: "ready";
  contractVersion: typeof CONTRACT_VERSION;
}

export function createServiceHealth(): ServiceHealth {
  return { status: "ready", contractVersion: CONTRACT_VERSION };
}

