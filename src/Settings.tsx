import { UpdatePanel, type AppUpdates } from "./AppUpdates";
import { defaultLogo, defaultPartnerLogo } from "./branding";
import { invoiceDefaults } from "./invoiceDefaults";
import { ImportCSV, ExportAllCSV } from "./ImportCSV";
import { useState, useRef } from "react";
import {
  Save,
  Download,
  FolderOpen,
  RotateCcw,
  ShieldCheck,
  RotateCw,
  Upload,
  Trash2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { type DB } from "./types";
import { audit } from "./domain";
import { type Commit, Field, Table } from "./ui";
import { desktop, backup } from "./storage";
export function Settings({
  updates,
  db,
  path,
  commit,
  busy,
  onRestore,
  onError,
  onNotify,
}: {
  updates: AppUpdates;
  db: DB;
  path: string;
  commit: Commit;
  busy: boolean;
  onRestore: () => void;
  onError: (s: string) => void;
  onNotify: (s: string) => void;
}) {
  const [s, setS] = useState({ ...db.settings[0] });
  const logoInputs = useRef<
    Partial<Record<"logo" | "partnerLogo", HTMLInputElement | null>>
  >({});
  const chooseLogo = (key: "logo" | "partnerLogo", value: string) => {
    const input = logoInputs.current[key];
    if (input) input.value = "";
    setS((v) => ({ ...v, [key]: value }));
  };
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
              <p>
                Pratinjau dan cetak invoice otomatis memakai pengaturan yang
                sudah disimpan. Profil saat transaksi tetap bisa dipilih pada
                pratinjau.
              </p>
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
            <div className="form-grid settings-profile-grid">
              {(
                [
                  ["name", "Nama toko / penerbit"],
                  ["invoiceIssuer", "Nama penerbit di invoice"],
                  ["address", "Alamat penerbit"],
                  ["phone", "Telepon"],
                  ["signature", "Nama penandatangan"],
                  ["bank", "Nama bank"],
                  ["beneficiary", "Nama penerima rekening"],
                  ["account", "Nomor rekening"],
                  ["bankBranch", "Cabang bank"],
                  ["bankCode", "Kode bank"],
                  ["country", "Negara"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  action={
                    key === "country" ? (
                      <button
                        className="field-action"
                        type="button"
                        aria-label="Reset negara ke bawaan"
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            country: invoiceDefaults.country,
                          }))
                        }
                      >
                        <RotateCcw size={13} />
                        Reset
                      </button>
                    ) : key === "signature" ? (
                      <button
                        className="field-action"
                        type="button"
                        onClick={() =>
                          setS((v) => ({
                            ...v,
                            signature: v.invoiceIssuer || v.name,
                          }))
                        }
                      >
                        Gunakan nama penerbit
                      </button>
                    ) : undefined
                  }
                >
                  <input
                    required={key === "name"}
                    value={s[key] || ""}
                    onChange={(e) => setS({ ...s, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <section
              className="settings-section"
              aria-labelledby="invoice-logos-heading"
            >
              <div className="settings-section-heading">
                <h4 id="invoice-logos-heading">Logo invoice</h4>
                <p>Digunakan pada invoice normal dan COPY.</p>
              </div>
              <div className="settings-logo-grid">
                {(["logo", "partnerLogo"] as const).map((key, i) => (
                  <Field
                    key={key}
                    label={
                      i ? "Logo mitra (opsional)" : "Logo penerbit (opsional)"
                    }
                    hint={`Bawaan: ${i ? "Phylion" : "Mitra Ecobike"}.`}
                    action={
                      <button
                        className="field-action"
                        type="button"
                        aria-label={`Reset logo ${i ? "Phylion" : "Mitra Ecobike"} ke bawaan`}
                        onClick={() =>
                          chooseLogo(key, i ? defaultPartnerLogo : defaultLogo)
                        }
                      >
                        <RotateCcw size={13} />
                        Reset
                      </button>
                    }
                  >
                    <div className="logo-preview settings-logo-preview">
                      {s[key] ? (
                        <img
                          src={s[key]}
                          alt={i ? "Logo mitra" : "Logo penerbit"}
                        />
                      ) : (
                        <span>Belum ada logo</span>
                      )}
                    </div>
                    <div className="settings-logo-actions">
                      <button
                        type="button"
                        aria-label={`Unggah logo ${i ? "mitra" : "penerbit"}`}
                        onClick={() => logoInputs.current[key]?.click()}
                      >
                        <Upload size={15} />
                        Unggah logo
                      </button>
                      {s[key] && (
                        <button
                          type="button"
                          className="logo-remove"
                          onClick={() => chooseLogo(key, "")}
                        >
                          <Trash2 size={14} />
                          Hapus logo
                        </button>
                      )}
                    </div>
                    <input
                      hidden
                      type="file"
                      ref={(el) => {
                        logoInputs.current[key] = el;
                      }}
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => image(key, e.target.files?.[0])}
                    />
                  </Field>
                ))}
              </div>
              <p className="settings-help">
                PNG, JPEG, atau WebP. Maksimal 500 KB per logo.
              </p>
            </section>
            <section
              className="settings-section settings-invoice-terms"
              aria-labelledby="invoice-terms-heading"
            >
              <div className="settings-section-heading">
                <h4 id="invoice-terms-heading">Pembayaran & garansi</h4>
                <p>Teks berikut ikut tercetak pada invoice.</p>
              </div>
              <Field
                label="Syarat pembayaran default"
                hint="Bawaan: Cash Before Delivery (CBD)."
                action={
                  <button
                    className="field-action"
                    type="button"
                    aria-label="Reset syarat pembayaran ke bawaan"
                    onClick={() =>
                      setS((v) => ({ ...v, terms: invoiceDefaults.terms }))
                    }
                  >
                    <RotateCcw size={13} />
                    Reset ke bawaan
                  </button>
                }
              >
                <textarea
                  rows={2}
                  value={s.terms}
                  onChange={(e) => setS({ ...s, terms: e.target.value })}
                />
              </Field>
              <Field
                label="Ketentuan garansi"
                hint="Bisa diedit sesuai ketentuan toko, termasuk pengecualian garansi dan ongkir."
                action={
                  <button
                    className="field-action"
                    type="button"
                    aria-label="Reset garansi ke bawaan"
                    onClick={() =>
                      setS((v) => ({
                        ...v,
                        warranty: invoiceDefaults.warranty,
                      }))
                    }
                  >
                    <RotateCcw size={13} />
                    Reset ke bawaan
                  </button>
                }
              >
                <textarea
                  rows={9}
                  placeholder="Isi ketentuan yang berlaku untuk barang toko kamu."
                  value={s.warranty}
                  onChange={(e) => setS({ ...s, warranty: e.target.value })}
                />
              </Field>
            </section>
            <div className="settings-actions">
              <button
                type="button"
                onClick={() =>
                  setS({
                    ...s,
                    ...invoiceDefaults,
                    name: s.name,
                    invoiceIssuer: invoiceDefaults.name,
                    invoiceDefaultsVersion: 1,
                    invoiceTextDefaultsVersion: 1,
                    brandingVersion: 1,
                  })
                }
              >
                <RotateCw size={16} />
                Gunakan template Mitra Ecobike
              </button>
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
        <UpdatePanel updates={updates} busy={busy} />
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
          <p className="form-note">
            CSV memuat barang, customer, order, transaksi, retur, dan
            pembayaran. Backup juga menyertakan profil toko dan riwayat
            aktivitas.
          </p>
          <ExportAllCSV db={db} />
          <ImportCSV db={db} commit={commit} busy={busy} />
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
              Dokumen final dapat diedit. Stok, HPP, retur, dan pembayaran
              terkait divalidasi kembali sebelum disimpan.
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
