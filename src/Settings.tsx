import { useState } from "react";
import {
  Save,
  Download,
  FolderOpen,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { type DB } from "./types";
import { audit } from "./domain";
import { type Commit, Field, Table } from "./ui";
import { desktop, backup } from "./storage";
export function Settings({
  db,
  path,
  commit,
  busy,
  onRestore,
  onError,
  onNotify,
}: {
  db: DB;
  path: string;
  commit: Commit;
  busy: boolean;
  onRestore: () => void;
  onError: (s: string) => void;
  onNotify: (s: string) => void;
}) {
  const [s, setS] = useState({ ...db.settings[0] });
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const image = async (key: "logo" | "partnerLogo", file?: File) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 500_000
    )
      return onError("Gunakan PNG, JPEG, atau WebP maksimal 500 KB.");
    const reader = new FileReader();
    reader.onload = () => setS((v) => ({ ...v, [key]: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  return (
    <div className="settings-layout">
      <div>
        <section className="panel settings-panel">
          <div className="section-heading">
            <div>
              <h3>Identitas & invoice</h3>
              <p>Perubahan profil berlaku untuk dokumen baru.</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await commit((d) => {
                if (!s.name.trim()) throw new Error("Nama toko wajib diisi.");
                d.settings = [s];
                audit(d, "Ubah profil toko", s.name);
              }, "Profil toko tersimpan");
            }}
          >
            <div className="form-grid">
              {(
                [
                  "name",
                  "address",
                  "phone",
                  "signature",
                  "bank",
                  "beneficiary",
                  "account",
                  "bankBranch",
                  "bankCode",
                  "country",
                ] as const
              ).map((key, i) => (
                <Field
                  key={key}
                  label={
                    [
                      "Nama toko / penerbit",
                      "Alamat penerbit",
                      "Telepon",
                      "Nama penandatangan",
                      "Nama bank",
                      "Nama penerima rekening",
                      "Nomor rekening",
                      "Cabang bank",
                      "Kode bank",
                      "Negara",
                    ][i]
                  }
                >
                  <input
                    required={key === "name"}
                    value={s[key]}
                    onChange={(e) => setS({ ...s, [key]: e.target.value })}
                  />
                </Field>
              ))}
              {(["logo", "partnerLogo"] as const).map((key, i) => (
                <Field
                  key={key}
                  label={
                    i ? "Logo mitra (opsional)" : "Logo penerbit (opsional)"
                  }
                  hint="PNG, JPEG, atau WebP maksimal 500 KB."
                >
                  {s[key] && (
                    <div className="logo-preview">
                      <img
                        src={s[key]}
                        alt={i ? "Logo mitra" : "Logo penerbit"}
                      />
                      <button
                        type="button"
                        onClick={() => setS({ ...s, [key]: "" })}
                      >
                        Hapus logo
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => image(key, e.target.files?.[0])}
                  />
                </Field>
              ))}
            </div>
            <Field label="Syarat pembayaran default">
              <textarea
                rows={2}
                value={s.terms}
                onChange={(e) => setS({ ...s, terms: e.target.value })}
              />
            </Field>
            <Field label="Ketentuan garansi">
              <textarea
                rows={7}
                placeholder="Isi ketentuan yang berlaku untuk barang toko kamu."
                value={s.warranty}
                onChange={(e) => setS({ ...s, warranty: e.target.value })}
              />
            </Field>
            <div className="settings-actions">
              <button className="primary" disabled={busy}>
                <Save size={16} />
                Simpan pengaturan
              </button>
            </div>
          </form>
        </section>
        <section className="panel settings-panel">
          <div className="section-heading">
            <h3>Kunci aplikasi</h3>
          </div>
          {!desktop ? (
            <p className="report-note">
              Penguncian password tersedia di aplikasi desktop. Pratinjau
              browser memakai data terpisah.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await invoke("set_password", {
                    current,
                    newPassword: password,
                  });
                  setPassword("");
                  setCurrent("");
                  onNotify(
                    password
                      ? "Password diperbarui"
                      : "Kunci password dinonaktifkan",
                  );
                } catch (e) {
                  onError(String(e));
                }
              }}
            >
              <div className="form-grid">
                <Field label="Password saat ini (kosong bila belum diatur)">
                  <input
                    type="password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </Field>
                <Field label="Password baru (kosong untuk menonaktifkan)">
                  <input
                    type="password"
                    minLength={password ? 8 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              </div>
              <p className="form-note">
                Kunci membatasi akses aplikasi. File CSV tidak dienkripsi; hak
                akses folder perangkat tetap berlaku.
              </p>
              <button>Simpan password</button>
            </form>
          )}
        </section>
      </div>
      <aside>
        <section className="panel settings-panel">
          <div className="section-heading">
            <h3>Penyimpanan & backup</h3>
            <FolderOpen size={20} />
          </div>
          <span className="badge active">
            {desktop ? "CSV lokal" : "Pratinjau browser"}
          </span>
          <p className="data-path">{path}</p>
          <p className="muted">
            Revisi data {db.revision}. Simpan otomatis ke generasi CSV baru saat
            menekan Simpan atau Sahkan. Draf tidak memengaruhi stok. Aplikasi
            mempertahankan 50 generasi data terakhir.
          </p>
          <button
            className="full"
            disabled={busy}
            onClick={async () => {
              try {
                if (await backup(db)) onNotify("Backup berhasil dibuat");
              } catch (e) {
                onError(String(e));
              }
            }}
          >
            <Download size={16} />
            Buat backup
          </button>
          <button className="full" disabled={busy} onClick={onRestore}>
            <RotateCcw size={16} />
            Pulihkan backup
          </button>
          <p className="form-note">
            Desktop: pilih folder backup yang berisi manifest.json. Sebelum
            pemulihan, aplikasi membuat backup otomatis. Simpan salinan terpisah
            dari perangkat utama.
          </p>
        </section>
        <section className="panel settings-panel">
          <h3>Aturan operasional</h3>
          <ul className="policy-list">
            <li>Rupiah bulat, kuantitas maksimal 3 desimal.</li>
            <li>Stok dalam satu satuan dasar per barang.</li>
            <li>
              HPP rata-rata bergerak; laporan keuntungan adalah laba kotor.
            </li>
            <li>Tanggal mutasi harus berurutan.</li>
            <li>Retur penjualan kembali menjadi stok layak jual.</li>
            <li>
              Dokumen final dikoreksi melalui pembatalan; mutasi turunan harus
              diselesaikan lebih dahulu.
            </li>
          </ul>
        </section>
      </aside>
      <section className="panel audit-panel">
        <div className="section-heading">
          <h3>Riwayat aktivitas</h3>
          <span className="muted">100 aktivitas terbaru</span>
        </div>
        <Table headers={["Waktu", "Aktivitas", "Referensi", "Keterangan"]}>
          {db.audit
            .slice(-100)
            .reverse()
            .map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.time).toLocaleString("id-ID")}</td>
                <td>{a.action}</td>
                <td>{a.entity}</td>
                <td className="wrap">{a.detail}</td>
              </tr>
            ))}
        </Table>
      </section>
    </div>
  );
}
