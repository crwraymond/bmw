import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { native, android } from "./storage";
import { Modal } from "./ui";
import { version as webVersion } from "../package.json";
import {
  installingUpdate,
  installSafely,
  updateError,
  updateRuntime,
  type UpdatePackage,
  type UpdatePhase,
  type UpdateRuntime,
} from "./updates";
export type UpdateMaintenance = (
  action: (revision: number) => Promise<void>,
) => Promise<void>;
export function useAppUpdates(
  ready: boolean,
  maintenance: UpdateMaintenance,
  enabled = native,
  runtime: UpdateRuntime = updateRuntime,
) {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [version, setVersion] = useState(webVersion);
  const [next, setNext] = useState<UpdatePackage | null>(null);
  const [error, setError] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [automatic, setAutomatic] = useState(() => {
    try {
      return localStorage.getItem("toko-offline-auto-update-check") !== "false";
    } catch {
      return true;
    }
  });
  const active = useRef(true),
    operation = useRef(false),
    handle = useRef<UpdatePackage | null>(null),
    request = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current++;
      void handle.current?.close().catch(() => {});
    };
  }, []);
  const checkNow = useCallback(async () => {
    if (!enabled || !ready || operation.current) return;
    operation.current = true;
    const token = ++request.current;
    setPhase("checking");
    setError("");
    try {
      const info = await runtime.info();
      if (!active.current || token !== request.current) return;
      setVersion(info.version);
      if (!info.supported)
        throw new Error("Pembaruan tersedia di aplikasi Windows dan Android.");
      if (!info.configured)
        throw new Error(
          "Kunci verifikasi update belum dikonfigurasi pada installer ini.",
        );
      await handle.current?.close();
      handle.current = null;
      setNext(null);
      const found = await runtime.check();
      if (!active.current || token !== request.current) {
        await found?.close();
        return;
      }
      handle.current = found;
      setNext(found);
      setPhase(found ? "available" : "current");
    } catch (e) {
      if (active.current && token === request.current) {
        setPhase("error");
        setError(updateError(e));
      }
    } finally {
      operation.current = false;
    }
  }, [enabled, ready, runtime]);
  useEffect(() => {
    if (!automatic || !enabled || !ready) return;
    const timer = setTimeout(() => {
      void checkNow();
    }, 1500);
    return () => clearTimeout(timer);
  }, [automatic, enabled, ready, checkNow]);
  const install = async () => {
    const target = handle.current;
    if (!target || operation.current || !enabled || !ready) return;
    operation.current = true;
    setError("");
    setBackupPath("");
    try {
      await maintenance((revision) =>
        installSafely(
          target,
          runtime,
          revision,
          setPhase,
          setProgress,
          setBackupPath,
        ),
      );
    } catch (e) {
      setError(updateError(e));
      setPhase("error");
    } finally {
      operation.current = false;
    }
  };
  return {
    enabled,
    phase,
    version,
    next,
    error,
    backupPath,
    progress,
    automatic,
    checkNow,
    install,
    setAutomatic: (value: boolean) => {
      setAutomatic(value);
      try {
        localStorage.setItem("toko-offline-auto-update-check", String(value));
      } catch {
        /* Optional device preference. */
      }
    },
  };
}
export type AppUpdates = ReturnType<typeof useAppUpdates>;
export function UpdatePanel({
  updates: u,
  busy,
}: {
  updates: AppUpdates;
  busy: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const installing = installingUpdate(u.phase);
  const status = {
    idle: "Belum diperiksa.",
    checking: "Memeriksa rilis terbaru…",
    available: `Versi ${u.next?.version} tersedia.`,
    current: "Aplikasi sudah menggunakan versi terbaru.",
    error: "Update belum selesai.",
    "backing-up": "Membuat dan memverifikasi backup…",
    downloading: `Mengunduh update${u.progress === null ? "…" : ` ${u.progress}%`}`,
    installing: "Memasang update. Aplikasi akan dibuka kembali…",
    installed: "Update sudah dipasang.",
    "awaiting-install":
      "Lanjutkan pemasangan pada dialog Android. Setelah selesai, buka aplikasi kembali.",
  }[u.phase];
  return (
    <section
      className="panel settings-panel update-panel"
      aria-label="Pembaruan aplikasi"
    >
      <div className="section-heading">
        <div>
          <h3>Pembaruan aplikasi</h3>
          <p>Versi {u.version}</p>
        </div>
        <RefreshCw size={20} />
      </div>
      {!u.enabled ? (
        <p className="form-note">
          Cek dan pasang update tersedia di aplikasi Windows dan Android.
          Pratinjau web memakai source lokal.
        </p>
      ) : (
        <>
          <p role="status">{status}</p>
          {u.error && (
            <p className="stock-error" role="alert">
              {u.error}
            </p>
          )}
          {u.next?.body && (
            <details className="update-notes">
              <summary>Catatan versi {u.next.version}</summary>
              <p>{u.next.body}</p>
            </details>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={u.automatic}
              disabled={installing}
              onChange={(e) => u.setAutomatic(e.target.checked)}
            />
            Cek otomatis saat aplikasi dibuka
          </label>
        </>
      )}
      <div className="update-actions">
        <button
          disabled={!u.enabled || busy || u.phase === "checking" || installing}
          onClick={() => void u.checkNow()}
        >
          <RefreshCw size={16} />
          Cek update
        </button>
        {u.next && (
          <button
            className="primary"
            disabled={busy || installing || u.phase === "checking"}
            onClick={() => setConfirm(true)}
          >
            <Download size={16} />
            Pasang update
          </button>
        )}
      </div>
      <p className="form-note">
        Pemasangan membuat backup data terlebih dahulu dan mempertahankan folder
        data toko. Simpan form yang sedang dikerjakan sebelum memasang.
        {android &&
          " Android akan meminta konfirmasi pemasangan APK. Jika izin pemasangan belum aktif, aktifkan pada layar Android lalu kembali dan tekan Pasang update lagi."}
      </p>
      {u.backupPath && (
        <p className="data-path">Backup sebelum update: {u.backupPath}</p>
      )}
      {confirm && (
        <Modal
          title="Pasang update aplikasi?"
          onClose={() => {
            if (!installing) setConfirm(false);
          }}
        >
          <div className="confirm-body">
            <p>
              Simpan semua perubahan form terlebih dahulu. Data tersimpan akan
              dibackup dan diverifikasi sebelum aplikasi ditutup untuk memasang
              versi {u.next?.version}.
            </p>
            <p role="status">{status}</p>
            {u.error && (
              <p className="stock-error" role="alert">
                {u.error}
              </p>
            )}
            {installing && (
              <progress
                aria-label="Progres update"
                max={100}
                value={
                  u.phase === "downloading"
                    ? (u.progress ?? undefined)
                    : undefined
                }
              />
            )}
            {u.backupPath && (
              <p className="data-path">Backup: {u.backupPath}</p>
            )}
          </div>
          <footer className="modal-footer">
            <button disabled={installing} onClick={() => setConfirm(false)}>
              Nanti
            </button>
            <button
              className="primary"
              disabled={busy || installing || u.phase === "installed"}
              onClick={() => void u.install()}
            >
              <Download size={16} />
              Backup & pasang
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
