import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useAppUpdates, UpdatePanel } from "../../src/AppUpdates";
import type { UpdateRuntime } from "../../src/updates";
const state = window as typeof window & { updateCalls: string[] };
state.updateCalls = [];
const mode = new URL(location.href).searchParams.get("mode");
const runtime: UpdateRuntime = {
  info: async () => ({ version: "0.2.1", configured: true, supported: true }),
  check: async () => {
    state.updateCalls.push("check");
    if (mode === "private") throw new Error("404 Not Found");
    if (mode === "current") return null;
    return {
      version: "0.2.2",
      body: "Perbaikan aplikasi",
      systemConfirmation: mode === "android",
      close: async () => {},
      download: async (event) => {
        state.updateCalls.push("download");
        if (mode === "signature") throw new Error("Invalid signature");
        event({ event: "Started", data: { contentLength: 100 } });
        event({ event: "Progress", data: { chunkLength: 50 } });
        event({ event: "Finished" });
      },
      install: async () => {
        state.updateCalls.push("install");
      },
    };
  },
  backup: async (revision) => {
    state.updateCalls.push(`backup:${revision}`);
    if (mode === "backup") throw new Error("Backup failed");
    return "backups/before-update/verified";
  },
};
function Harness() {
  const [busy, setBusy] = useState(false);
  const u = useAppUpdates(
    true,
    async (job) => {
      setBusy(true);
      try {
        await job(9);
      } finally {
        setBusy(false);
      }
    },
    true,
    runtime,
  );
  return <UpdatePanel updates={u} busy={busy} />;
}
const host = document.createElement("div");
document.getElementById("root")?.remove();
document.body.append(host);
createRoot(host).render(<Harness />);
