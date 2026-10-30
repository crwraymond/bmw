import { useState } from "react";
import { Database, HardDrive, RefreshCw } from "lucide-react";
import { cloudConfigured } from "./cloud";
import {
  connectCloud,
  storageState,
  syncToCloud,
  useLocalCSV,
} from "./storage";
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
  const state = storageState();
  const cloud = state.mode === "supabase";
  const [choice, setChoice] = useState<
    "sync" | "connect" | "local" | "offline" | null
  >(null);
  const run = () => {
    const action = choice;
    setChoice(null);
    void onAction(() =>
      action === "sync"
        ? syncToCloud(db)
        : action === "connect"
          ? connectCloud()
          : useLocalCSV(action === "offline"),
    );
  };
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
      {!cloudConfigured() && (
        <p className="form-note">
          Koneksi database belum disertakan dalam build ini. CSV lokal tetap
          dapat digunakan.
        </p>
      )}
      {!cloud && (
        <>
          <button
            className="primary full"
            disabled={busy || !cloudConfigured()}
            onClick={() => setChoice("sync")}
          >
            <RefreshCw size={16} />
            {state.pending
              ? "Coba lagi sync ke database"
              : "Sync ke database & gunakan"}
          </button>
          <button
            className="full"
            disabled={busy || !cloudConfigured()}
            onClick={() => setChoice("connect")}
          >
            <Database size={16} />
            Muat data Supabase
          </button>
          <p className="form-note">
            Sync membuat backup dahulu dan hanya beralih setelah data
            terverifikasi. Jika database berubah di perangkat lain, unggahan
            dihentikan.
          </p>
        </>
      )}
      {cloud && (
        <>
          <button
            className="full"
            disabled={busy}
            onClick={() => setChoice("connect")}
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
      {choice && (
        <Modal
          title={
            choice === "sync"
              ? "Sync dan gunakan database?"
              : choice === "connect"
                ? "Muat data Supabase?"
                : "Gunakan CSV lokal?"
          }
          onClose={() => setChoice(null)}
        >
          <p>
            {choice === "sync"
              ? "Seluruh data lokal akan dikirim ke database toko, termasuk customer, transaksi, pembayaran, dan profil toko. Backup CSV dibuat terlebih dahulu. Setelah berhasil, aplikasi selalu memakai database sampai kamu memilih CSV lagi."
              : choice === "connect"
                ? "Aplikasi akan memakai data terbaru dari Supabase. Data CSV di perangkat tetap disimpan dan tidak diunggah. Gunakan ini untuk menghubungkan perangkat lain atau sesudah terjadi konflik."
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
