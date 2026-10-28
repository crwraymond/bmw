import { ImportCSV } from "./ImportCSV";
import { exportData } from "./dataImport";
import { NumberInput, SearchSelect } from "./inputs";
import { useState } from "react";
import { Plus, Ban, Pencil, Check, Trash2 } from "lucide-react";
import { revisePayment, deletePayment } from "./revisions";
import {
  compareCodes,
  type DB,
  type Payment,
  uid,
  today,
  money,
  dateLabel,
} from "./types";
import {
  balance,
  due,
  activeDocs,
  nextNumber,
  savePayment,
  singleSupplier,
  paid,
  returnedValue,
  settleInvoice,
} from "./domain";
import {
  type Commit,
  Toolbar,
  Empty,
  Table,
  Status,
  Modal,
  Field,
  DeleteConfirm,
} from "./ui";
import { exportCSV } from "./storage";
export function Payments({
  db,
  commit,
  busy,
  onCancel,
}: {
  db: DB;
  commit: Commit;
  busy: boolean;
  onCancel: (p: Payment) => void;
}) {
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [kind, setKind] = useState<"customer" | "supplier">("customer");
  const list = db.payments
    .filter((p) =>
      `${p.number} ${db.parties.find((x) => x.id === p.partyId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice()
    .reverse();
  const bills = activeDocs(db)
    .filter(
      (d) =>
        ["sale", "purchase"].includes(d.kind) &&
        `${d.number} ${d.partyName} ${db.parties.find((p) => p.id === d.partyId)?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.seq - a.seq);
  const invoices = edit
    ? activeDocs(db).filter(
        (d) =>
          d.partyId === edit.partyId &&
          d.kind === (kind === "customer" ? "sale" : "purchase") &&
          (due(db, d.id) > 0 ||
            db.allocations.some(
              (a) => a.paymentId === edit.id && a.docId === d.id,
            )),
      )
    : [];
  const create = () => {
    setKind("customer");
    setAlloc({});
    setEdit({
      id: uid(),
      number: nextNumber(db, "payment"),
      date: today(),
      partyId: "",
      direction: "in",
      amount: 0,
      notes: "",
      status: "final",
    });
  };
  const openEdit = (payment: Payment) => {
    setKind(
      db.parties.find((p) => p.id === payment.partyId)?.kind || "customer",
    );
    setAlloc(
      Object.fromEntries(
        db.allocations
          .filter((a) => a.paymentId === payment.id)
          .map((a) => [a.docId, a.amount]),
      ),
    );
    setEdit({ ...payment });
  };
  return (
    <>
      <Toolbar
        search={search}
        setSearch={setSearch}
        onExport={() => {
          const data = exportData(
            db,
            "payments",
            list.map((p) => p.id),
          );
          exportCSV("pembayaran.csv", data.headers, data.rows);
        }}
      >
        <ImportCSV db={db} target="payments" commit={commit} busy={busy} />
        <button className="primary" onClick={create}>
          <Plus size={17} />
          Catat pembayaran
        </button>
      </Toolbar>
      <section className="panel settlement-bills" aria-label="Daftar tagihan">
        <div className="section-heading">
          <h3>Tagihan penjualan & pembelian</h3>
        </div>
        {bills.length ? (
          <Table
            headers={[
              "Tagihan",
              "Customer / pembelian",
              "Total tagihan",
              "Sudah dibayar",
              "Sisa",
              "Status",
              "Aksi",
            ]}
          >
            {bills.map((d) => {
              const remaining = due(db, d.id);
              const returned = returnedValue(db, d.id);
              return (
                <tr key={d.id}>
                  <td>
                    <strong>{d.number}</strong>
                    <small>
                      {dateLabel(d.date)} ·{" "}
                      {d.kind === "sale" ? "Penjualan" : "Pembelian"}
                    </small>
                  </td>
                  <td>
                    {db.parties.find((p) => p.id === d.partyId)?.name ??
                      d.partyName}
                  </td>
                  <td>
                    {money(d.total)}
                    {returned > 0 && <small>Retur: {money(returned)}</small>}
                  </td>
                  <td>{money(paid(db, d.id))}</td>
                  <td>
                    {money(Math.max(0, remaining))}
                    {remaining < 0 && (
                      <small>Kredit: {money(-remaining)}</small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${remaining > 0 ? "warning" : "final"}`}
                    >
                      {remaining > 0 ? "Belum lunas" : "Lunas"}
                    </span>
                  </td>
                  <td className="settlement-actions">
                    <div className="settlement-action">
                      <button
                        type="button"
                        className={remaining > 0 ? "primary" : ""}
                        aria-label={`${remaining > 0 ? "Lunasi" : "Lunas"} ${d.number}`}
                        title={
                          remaining > 0
                            ? `Catat pembayaran ${money(remaining)} untuk ${d.number}`
                            : "Tagihan sudah lunas"
                        }
                        disabled={busy || remaining <= 0}
                        onClick={() =>
                          commit(
                            (next) => settleInvoice(next, d.id),
                            `Tagihan ${d.number} lunas`,
                          )
                        }
                      >
                        <Check size={15} />
                        {remaining > 0 ? "Lunasi" : "Lunas"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty
            title={search ? "Tagihan tidak ditemukan" : "Belum ada tagihan"}
            detail="Nota penjualan dan faktur pembelian yang sudah disahkan akan tampil di sini."
          />
        )}
      </section>
      <section className="panel" aria-label="Riwayat pembayaran">
        <div className="section-heading">
          <h3>Riwayat pembayaran</h3>
        </div>
        {list.length ? (
          <Table
            headers={[
              "Pembayaran",
              "Customer / pembelian",
              "Nominal",
              "Status",
              "",
            ]}
          >
            {list.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.number}</strong>
                  <small>{dateLabel(p.date)}</small>
                </td>
                <td>{db.parties.find((x) => x.id === p.partyId)?.name}</td>
                <td>{money(p.amount)}</td>
                <td>
                  <Status value={p.status} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      disabled={busy}
                      title="Hapus pembayaran"
                      aria-label={`Hapus pembayaran ${p.number}`}
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 size={15} />
                    </button>
                    {p.status === "final" && (
                      <>
                        <button
                          title="Edit pembayaran"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          title="Batalkan pembayaran"
                          onClick={() => onCancel(p)}
                        >
                          <Ban size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="Belum ada pembayaran"
            detail="Catat penerimaan customer atau pelunasan pembelian, lalu alokasikan ke tagihannya."
            action={
              <button className="primary" onClick={create}>
                Catat pembayaran pertama
              </button>
            }
          />
        )}
      </section>
      {deleting && (
        <DeleteConfirm
          name={`pembayaran ${deleting.number} (${money(deleting.amount)})`}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async (reportError) => {
            if (
              await commit(
                (d) => deletePayment(d, deleting.id),
                "Pembayaran dihapus",
                reportError,
              )
            )
              setDeleting(null);
          }}
        />
      )}
      {edit && (
        <Modal
          title={
            db.payments.some((p) => p.id === edit.id)
              ? "Edit pembayaran"
              : "Catat pembayaran / pelunasan"
          }
          onClose={() => setEdit(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit(
                  (d) =>
                    (d.payments.some((p) => p.id === edit.id)
                      ? revisePayment
                      : savePayment)(
                      d,
                      edit,
                      Object.entries(alloc).map(([docId, amount]) => ({
                        docId,
                        amount,
                      })),
                    ),
                  "Pembayaran tersimpan",
                )
              )
                setEdit(null);
            }}
          >
            <div className="form-grid three">
              <Field label="Jenis pembayaran">
                <select
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as typeof kind;
                    setKind(k);
                    setAlloc({});
                    setEdit({
                      ...edit,
                      partyId: k === "supplier" ? singleSupplier(db).id : "",
                      direction: k === "customer" ? "in" : "out",
                    });
                  }}
                >
                  <option value="customer">Penerimaan customer</option>
                  <option value="supplier">Pelunasan pembelian</option>
                </select>
              </Field>
              {kind === "customer" && (
                <Field label="Customer">
                  <SearchSelect
                    required
                    value={edit.partyId}
                    placeholder="Cari kode atau nama kontak…"
                    options={db.parties
                      .filter(
                        (p) =>
                          p.kind === kind &&
                          (p.active || p.id === edit.partyId),
                      )
                      .sort(compareCodes)
                      .map((p) => ({
                        value: p.id,
                        label: `${p.code} — ${p.name}`,
                        search: p.phone,
                      }))}
                    onChange={(value) => {
                      setEdit({ ...edit, partyId: value });
                      setAlloc({});
                    }}
                  />
                </Field>
              )}
              <Field label="Nomor pembayaran">
                <input
                  required
                  value={edit.number}
                  onChange={(e) => setEdit({ ...edit, number: e.target.value })}
                />
              </Field>
              <Field label="Tanggal">
                <input
                  type="date"
                  required
                  value={edit.date}
                  onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                />
              </Field>
              <Field label="Nominal dibayar (Rp)">
                <NumberInput
                  required
                  min="1"
                  value={edit.amount}
                  onValueChange={(value) => setEdit({ ...edit, amount: value })}
                />
              </Field>
              <Field label="Catatan / metode">
                <input
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </Field>
            </div>
            {edit.partyId && (
              <>
                <div className="section-heading">
                  <h3>Alokasi pembayaran</h3>
                  <span>Saldo pihak: {money(balance(db, edit.partyId))}</span>
                </div>
                {invoices.length ? (
                  <Table
                    headers={[
                      "Tagihan",
                      "Tanggal",
                      "Sisa tagihan",
                      "Bayar (Rp)",
                    ]}
                  >
                    {invoices.map((d) => (
                      <tr key={d.id}>
                        <td>{d.number}</td>
                        <td>{dateLabel(d.date)}</td>
                        <td>{money(due(db, d.id))}</td>
                        <td>
                          <NumberInput
                            aria-label={`Alokasi ${d.number}`}
                            min="0"
                            max={Math.max(
                              due(db, d.id) +
                                (db.allocations.find(
                                  (a) =>
                                    a.paymentId === edit.id && a.docId === d.id,
                                )?.amount || 0),
                              db.allocations.find(
                                (a) =>
                                  a.paymentId === edit.id && a.docId === d.id,
                              )?.amount || 0,
                            )}
                            value={alloc[d.id] || 0}
                            onValueChange={(value) =>
                              setAlloc({
                                ...alloc,
                                [d.id]: value,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <p className="form-note">
                    Tidak ada tagihan terbuka. Pembayaran tanpa alokasi hanya
                    untuk melunasi saldo awal.
                  </p>
                )}
                <p className="form-note">
                  Dialokasikan:{" "}
                  {money(Object.values(alloc).reduce((s, v) => s + v, 0))}. Sisa
                  nominal tanpa alokasi hanya boleh untuk saldo awal.
                </p>
              </>
            )}
            <footer className="modal-footer">
              <button type="button" onClick={() => setEdit(null)}>
                Batal
              </button>
              <button className="primary" disabled={busy}>
                Simpan pembayaran
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
