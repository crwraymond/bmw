import { useState, useRef } from "react";
import { Upload, FileCheck, Download } from "lucide-react";
import { type DB } from "./types";
import { type Commit, Modal, Field, Table } from "./ui";
import { exportCSV, download } from "./storage";
import { csvText } from "./csv";
import {
  applyImport,
  detectImportTarget,
  exportData,
  importHeaders,
  importLabel,
  prepareImport,
  targets,
  type ImportTarget,
  type ImportMode,
  type ImportPlan,
  type ImportFile,
} from "./dataImport";

export function ExportAllCSV({ db }: { db: DB }) {
  // One CSV with typed records packages every operational dataset in one portable file.
  return (
    <button
      className="full"
      onClick={() => download("semua-data-toko.csv", exportAllCSV(db))}
    >
      <Download size={16} />
      Ekspor semua data (CSV)
    </button>
  );
}
export function exportAllCSV(db: DB) {
  const datasets = targets.map((target) => ({
    target,
    ...exportData(db, target),
  }));
  const headers = [
    ...new Set(datasets.flatMap((d) => d.headers)),
    "Dataset kosong",
  ];
  const rows = datasets.flatMap((d) =>
    d.rows.length
      ? d.rows.map((row) =>
          headers.map((h) => {
            const index = d.headers.indexOf(h);
            return index < 0 ? "" : row[index];
          }),
        )
      : [
          headers.map((h) =>
            h === "Jenis data" ? d.target : h === "Dataset kosong" ? "ya" : "",
          ),
        ],
  );
  return csvText(headers, rows);
}
// Blank cells for unrelated datasets must not become "clear field" instructions.
export function splitAllCSV(text: string): ImportFile[] {
  const parsed = parseCSV(text);
  if (!parsed.headers.includes("jenis data"))
    return [{ target: detectImportTarget(text), text }];
  const groups = new Map<ImportTarget, typeof parsed.rows>();
  for (const row of parsed.rows) {
    const target = row.cells["jenis data"] as ImportTarget;
    if (!targets.includes(target))
      throw new Error(`Baris ${row.line}: Jenis data tidak dikenali.`);
    groups.set(target, [...(groups.get(target) || []), row]);
  }
  return [...groups].map(([target, rows]) => {
    const headers = importHeaders(target).filter((h) =>
      parsed.headers.includes(headerKey(h)),
    );
    const empty = rows.some((r) => r.cells["dataset kosong"] === "ya");
    if (
      empty &&
      (rows.length !== 1 ||
        Object.entries(rows[0].cells).some(
          ([k, v]) => !["jenis data", "dataset kosong"].includes(k) && v,
        ))
    )
      throw new Error(
        "Penanda dataset kosong tidak boleh dicampur dengan data.",
      );
    return {
      target,
      text: csvText(
        headers,
        empty ? [] : rows.map((r) => headers.map((h) => r.cells[headerKey(h)])),
      ),
      empty,
    };
  });
}
import { parseCSV, headerKey } from "./csv";
export function ImportCSV({
  db,
  commit,
  busy,
  target,
}: {
  db: DB;
  commit: Commit;
  busy: boolean;
  target?: ImportTarget;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<ImportMode>("upsert"),
    [files, setFiles] = useState<ImportFile[]>([]),
    [names, setNames] = useState(""),
    [plan, setPlan] = useState<ImportPlan | null>(null),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const request = useRef(0);
  const resetPreview = () => {
    setPlan(null);
    setError("");
    setConfirmed(false);
  };
  const close = () => {
    request.current++;
    setOpen(false);
    setReading(false);
    setFiles([]);
    setNames("");
    resetPreview();
  };
  return (
    <>
      <button
        disabled={busy}
        className={target ? undefined : "full"}
        onClick={() => setOpen(true)}
      >
        <Upload size={16} />
        {target ? "Impor CSV" : "Impor data (CSV)"}
      </button>
      {open && (
        <Modal
          title={`Impor ${target ? importLabel(target).toLowerCase() : "semua data"}`}
          onClose={close}
          wide
        >
          <div className="import-body">
            <p className="muted">
              Gunakan CSV dari ekspor terbaru atau template. Kode dan nomor
              menjadi kunci pencocokan. Semua perubahan diterapkan bersama
              setelah file lolos pemeriksaan.
            </p>
            <div
              className="import-modes"
              role="radiogroup"
              aria-label="Mode impor"
            >
              {(["upsert", "replace"] as const).map((m) => (
                <label
                  className={`import-mode ${mode === m ? "selected" : ""}`}
                  key={m}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => {
                      setMode(m);
                      resetPreview();
                    }}
                  />
                  <span>
                    <strong>{m === "upsert" ? "Upsert" : "Replace"}</strong>
                    <small>
                      {m === "upsert"
                        ? "Tambah data baru dan perbarui kode/nomor yang sudah ada. Data lain tetap disimpan."
                        : "Ganti jenis data yang ada dalam file. Data yang tidak ada di file akan dihapus; master yang masih dipakai dinonaktifkan."}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <Field
              label={target ? "File CSV" : "File CSV (boleh beberapa file)"}
              hint="UTF-8, maksimal 20 MB dan 10.000 baris per file. Angka: 1.234,5; tanggal: YYYY-MM-DD."
            >
              <input
                type="file"
                accept=".csv,text/csv"
                multiple={!target}
                disabled={reading || busy}
                onChange={async (e) => {
                  const selected = Array.from(e.target.files || []),
                    id = ++request.current;
                  resetPreview();
                  setFiles([]);
                  setNames("");
                  if (!selected.length) return;
                  setReading(true);
                  try {
                    const inputs: ImportFile[] = [];
                    for (const f of selected) {
                      if (f.size > 20_000_000)
                        throw new Error(`${f.name}: maksimal 20 MB.`);
                      const content = await f.text();
                      inputs.push(
                        ...(target
                          ? [{ target, text: content }]
                          : splitAllCSV(content)),
                      );
                    }
                    if (id === request.current) {
                      setFiles(inputs);
                      setNames(selected.map((f) => f.name).join(", "));
                    }
                  } catch (e) {
                    if (id === request.current)
                      setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    if (id === request.current) setReading(false);
                  }
                }}
              />
            </Field>
            <div className="actions">
              {target && (
                <button
                  onClick={() =>
                    exportCSV(
                      `template-${target}.csv`,
                      importHeaders(target),
                      [],
                    )
                  }
                >
                  <Download size={16} />
                  Unduh template
                </button>
              )}
              <button
                disabled={!files.length || reading || busy}
                onClick={() => {
                  resetPreview();
                  try {
                    setPlan(prepareImport(db, files, mode));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                <FileCheck size={16} />
                Periksa file
              </button>
            </div>
            {!target && (
              <p className="form-note">
                Pilih satu hasil “Ekspor semua data” atau beberapa ekspor
                halaman. Barang, customer, order, transaksi, retur, dan
                pembayaran diproses bersama. Replace hanya mengganti jenis data
                yang disertakan; pengaturan toko dan riwayat aktivitas tetap
                disimpan.
              </p>
            )}
            {target && (
              <p className="form-note">
                Untuk transaksi, satu baris per barang; pembayaran satu baris
                per alokasi. Impor barang dan customer lebih dahulu, lalu
                order/transaksi asal, retur, dan pembayaran. Untuk memindahkan
                seluruh data beserta uang muka, gunakan impor gabungan di
                Pengaturan.
              </p>
            )}
            {error && (
              <div className="import-error" role="alert">
                <strong>Impor belum dapat dilakukan</strong>
                <pre>{error}</pre>
                <span>Data tersimpan belum berubah.</span>
              </div>
            )}
            {plan && (
              <section className="import-preview" aria-label="Pratinjau impor">
                <div className="section-heading">
                  <h3>Pratinjau perubahan</h3>
                  <span>{plan.records.toLocaleString("id-ID")} baris CSV</span>
                </div>
                <p className="muted">{names}</p>
                <div className="import-counts">
                  {(
                    ["Tambah", "Perbarui", "Hapus", "Nonaktifkan"] as const
                  ).map((action) => (
                    <span key={action}>
                      <strong>
                        {plan.changes.filter((c) => c.action === action).length}
                      </strong>
                      {action}
                    </span>
                  ))}
                </div>
                {plan.warnings.map((w) => (
                  <p className="form-note" key={w}>
                    {w}
                  </p>
                ))}
                <Table headers={["Jenis data", "Kode / nomor", "Tindakan"]}>
                  {plan.changes.slice(0, 30).map((c, i) => (
                    <tr key={i}>
                      <td>{importLabel(c.target)}</td>
                      <td>{c.key}</td>
                      <td>{c.action}</td>
                    </tr>
                  ))}
                </Table>
                {plan.changes.length > 30 && (
                  <p className="form-note">
                    Menampilkan 30 dari {plan.changes.length} perubahan.
                  </p>
                )}
                {mode === "replace" && (
                  <label className="check import-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Saya memahami data pada jenis yang disertakan akan diganti
                    sesuai pratinjau.
                  </label>
                )}
              </section>
            )}
          </div>
          <footer className="modal-footer">
            <button disabled={busy} onClick={close}>
              Batal
            </button>
            <button
              className="primary"
              disabled={
                !plan || busy || reading || (mode === "replace" && !confirmed)
              }
              onClick={async () => {
                if (
                  plan &&
                  (await commit(
                    (d) => applyImport(d, plan),
                    "Impor CSV berhasil",
                  ))
                )
                  close();
              }}
            >
              Terapkan {mode === "upsert" ? "Upsert" : "Replace"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
