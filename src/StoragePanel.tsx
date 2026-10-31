import { useState } from "react";
import { Database, HardDrive, RefreshCw } from "lucide-react";
import { cloudConfigured } from "./cloud";
import {
  connectCloud,
  storageState,
  syncToCloud,
  useLocalCSV,
} from "./storage";
import { android } from "./platform";
import { ConnectionSetup, ConnectionShare } from "./StoreConnection";
import { type DB } from "./types";
import { Modal } from "./ui";
export type StorageAction = (
  action: () => Promise<{ db: DB; path: string }>,
) => Promise<void>;
export function StoragePanel({
  db,
  busy,
  onAction,
}: {
  db: DB;
  busy: boolean;
  onAction: StorageAction;
}) {
  const state = storageState(),
    cloud = state.mode === "supabase",
    configured = cloudConfigured();
  const [choice, setChoice] = useState<"sync" | "local" | "offline" | null>(
    null,
  );
  const [setup, setSetup] = useState<"sync" | "connect" | "configure" | null>(
    null,
  );
  const [sharing, setSharing] = useState(false);
  const hasLocalData =
    state.csvBaseRevision !== undefined ||
    db.items.length > 0 ||
    db.documents.length > 0 ||
    db.payments.length > 0 ||
    db.parties.some((p) => p.kind === "customer");
  const request = (action: "sync" | "connect") => {
    if (!cloudConfigured()) {
      setSetup(action);
      return;
    }
    if (action === "connect") void onAction(connectCloud);
    else setChoice("sync");
  };
  const run = () => {
    const action = choice;
    setChoice(null);
    void onAction(() =>
      action === "sync" ? syncToCloud(db) : useLocalCSV(action === "offline"),
    );
  };
  const connectButton = (
    <button
      className={android ? "primary full" : "full"}
      disabled={busy}
      onClick={() => request("connect")}
    >
      <Database size={16} />
      Gunakan database toko
    </button>
  );
  return (
    <section
      className="panel settings-panel"
      aria-labelledby="storage-mode-heading"
    >
      <div className="section-heading">
        <h3 id="storage-mode-heading">Sumber data</h3>
        <Database size={20} />
      </div>
      <p>
        <strong>{cloud ? "Database Supabase aktif" : "CSV lokal aktif"}</strong>
      </p>
      <p className="form-note">
        {cloud
          ? "Data dibaca dan disimpan online. Desktop dan HP memakai database toko yang sama."
          : "Data dibaca dan disimpan di perangkat ini. Perubahan lokal belum otomatis dikirim ke database."}
      </p>
      {!configured && (
        <p className="form-note">
          Perangkat ini belum terhubung ke toko. Hubungkan sekali dengan kode
          atau file koneksi toko; tidak perlu login.
        </p>
      )}
      {!cloud && (
        <>
          {android && connectButton}
          {(!android || hasLocalData) && (
            <button
              className={android ? "full" : "primary full"}
              disabled={busy}
              onClick={() => request("sync")}
            >
              <RefreshCw size={16} />
              {state.pending
                ? "Coba lagi sync ke database"
                : "Sync ke database & gunakan"}
            </button>
          )}
          {!android && connectButton}
          <p className="form-note">
            {android
              ? "Setelah sync dari desktop berhasil, gunakan database untuk mengambil data yang sama di HP. CSV HP tidak diunggah oleh tombol Gunakan database."
              : "Sync membuat backup dahulu dan hanya beralih setelah data terverifikasi. Jika database berubah di perangkat lain, unggahan dihentikan."}
          </p>
        </>
      )}
      {cloud && (
        <>
          <button
            className="full"
            disabled={busy}
            onClick={() => request("connect")}
          >
            <RefreshCw size={16} />
            Muat ulang database
          </button>
          <button
            className="full"
            disabled={busy}
            onClick={() => setChoice("local")}
          >
            <HardDrive size={16} />
            Salin database & gunakan CSV
          </button>
          <button
            className="full"
            disabled={busy}
            onClick={() => setChoice("offline")}
          >
            Gunakan CSV tersimpan (offline)
          </button>
          <p className="form-note">
            Salin database memerlukan internet. CSV tersimpan mungkin lebih
            lama; perubahan tidak dapat diunggah jika database sudah berubah.
          </p>
        </>
      )}
      {configured && (
        <button
          className="full"
          disabled={busy}
          onClick={() => setSharing(true)}
        >
          Hubungkan perangkat lain
        </button>
      )}
      <button
        className="field-action"
        disabled={busy}
        onClick={() => setSetup("configure")}
      >
        Atur koneksi toko
      </button>
      {setup && (
        <ConnectionSetup
          onClose={() => setSetup(null)}
          onReady={() => {
            const action = setup;
            setSetup(null);
            if (action === "connect") void onAction(connectCloud);
            if (action === "sync") setChoice("sync");
          }}
        />
      )}
      {sharing && <ConnectionShare onClose={() => setSharing(false)} />}
      {choice && (
        <Modal
          title={
            choice === "sync"
              ? "Sync dan gunakan database?"
              : "Gunakan CSV lokal?"
          }
          onClose={() => setChoice(null)}
        >
          <p>
            {choice === "sync"
              ? "Seluruh data lokal akan dikirim ke database toko, termasuk customer, transaksi, pembayaran, dan profil toko. Backup CSV dibuat terlebih dahulu. Setelah berhasil, aplikasi selalu memakai database sampai kamu memilih CSV lagi."
              : choice === "local"
                ? "Data terbaru dari database akan disalin ke CSV perangkat ini. CSV sebelumnya dibackup. Setelah beralih, perubahan tersimpan lokal sampai kamu melakukan sync lagi."
                : "Aplikasi akan membuka CSV yang sudah tersimpan di perangkat ini tanpa mengunduh data Supabase. Data ini mungkin lebih lama. Database tidak diubah."}
          </p>
          <div className="actions">
            <button onClick={() => setChoice(null)}>Batal</button>
            <button className="primary" onClick={run}>
              Lanjutkan
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
