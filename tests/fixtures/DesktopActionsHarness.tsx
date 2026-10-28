import React from "react";
import { createRoot } from "react-dom/client";
import { DesktopActions } from "../../src/DesktopActions";
const host = document.createElement("div");
document.getElementById("root")?.remove();
document.body.append(host);
const root = createRoot(host);
const state = window as typeof window & {
  exitCalls: number;
  minimizeCalls: number;
  renderExit: (busy: boolean) => void;
};
state.exitCalls = 0;
state.minimizeCalls = 0;
state.renderExit = (busy: boolean) =>
  root.render(
    <DesktopActions
      enabled
      busy={busy}
      onError={() => {}}
      minimizeWindow={async () => {
        state.minimizeCalls++;
      }}
      closeWindow={async () => {
        state.exitCalls++;
      }}
    />,
  );
state.renderExit(false);
