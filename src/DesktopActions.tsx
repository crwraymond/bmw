import { useState } from "react";
import { LogOut, Minus } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktop, android } from "./storage";
import { Modal } from "./ui";
export function DesktopActions({
  busy,
  onError,
  enabled = desktop,
  minimizeWindow = () => getCurrentWindow().minimize(),
  closeWindow = () => getCurrentWindow().close(),
}: {
  busy: boolean;
  onError: (message: string) => void;
  enabled?: boolean;
  minimizeWindow?: () => Promise<void>;
  closeWindow?: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  if (android) return null;
  return (
    <>
      <div className="desktop-window-actions">
        <button
          type="button"
          className="desktop-minimize"
          aria-label="Minimalkan aplikasi"
          disabled={busy || !enabled}
          title={
            enabled
              ? "Minimalkan aplikasi ke taskbar"
              : "Tersedia di aplikasi desktop Windows."
          }
          onClick={async () => {
            try {
              await minimizeWindow();
            } catch (e) {
              onError(String(e));
            }
          }}
        >
          <Minus size={17} />
          <span>Minimize</span>
        </button>
        <button
          type="button"
          className="desktop-exit"
          aria-label="Keluar aplikasi"
          disabled={busy || !enabled}
          title={
            enabled
              ? "Keluar aplikasi"
              : "Tersedia di aplikasi desktop Windows. Tutup tab untuk keluar dari pratinjau web."
          }
          onClick={() => setConfirm(true)}
        >
          <LogOut size={17} />
          <span>Keluar</span>
        </button>
      </div>
      {confirm && (
        <Modal title="Keluar aplikasi?" onClose={() => setConfirm(false)}>
          <div className="confirm-body">
            <p>
              Data yang sudah disimpan tetap ada. Perubahan pada form yang belum
              disimpan akan hilang saat aplikasi ditutup.
            </p>
          </div>
          <footer className="modal-footer">
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Kembali
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                try {
                  await closeWindow();
                } catch (e) {
                  onError(String(e));
                  setConfirm(false);
                }
              }}
            >
              Keluar aplikasi
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
