import { useState } from "react";
import { LogOut } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktop } from "./storage";
import { Modal } from "./ui";
export function DesktopActions({
  busy,
  onError,
  enabled = desktop,
  closeWindow = () => getCurrentWindow().close(),
}: {
  busy: boolean;
  onError: (message: string) => void;
  enabled?: boolean;
  closeWindow?: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        className="desktop-exit"
        aria-label="Keluar aplikasi"
        disabled={busy}
        onClick={() => setConfirm(true)}
      >
        <LogOut size={17} />
        <span>Keluar</span>
      </button>
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
