import type { ProtoVaultDesktopApi } from "../../preload";

declare global {
  interface Window {
    protoVault: ProtoVaultDesktopApi;
  }
}

export {};
