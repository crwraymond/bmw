import { useState } from "react";
import { Plus, Ban } from "lucide-react";
import { type DB, type Payment, uid, today, money, dateLabel } from "./types";
import { balance, due, activeDocs, nextNumber, savePayment } from "./domain";
import { type Commit, Toolbar, Empty, Table, Status, Modal, Field } from "./ui";
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
  const invoices = edit
    ? activeDocs(db).filter(
        (d) =>
          d.partyId === edit.partyId &&
          d.kind === (kind === "customer" ? "sale" : "purchase") &&
          due(db, d.id) > 0,
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
  return (
    <>
      <Toolbar
        search={search}
        setSearch={setSearch}
        onExport={() =>
          exportCSV(
            "pembayaran.csv",
            ["Nomor", "Tanggal", "Pihak", "Arah", "Nominal", "Status"],
            list.map((p) => [
              p.number,
              p.date,
              db.parties.find((x) => x.id === p.partyId)?.name || "",
              p.direction,
              p.amount,
              p.status,
            ]),
          )
        }
      >
        <button className="primary" onClick={create}>
          <Plus size={17} />
          Catat pembayaran
        </button>
      </Toolbar>
      <section className="panel">
        {list.length ? (
          <Table
            headers={[
              "Pembayaran",
              "Customer / pemasok",
              "Arah",
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
                <td>
                  {p.direction === "in"
                    ? "Penerimaan customer"
                    : "Pembayaran pemasok"}
                </td>
                <td>{money(p.amount)}</td>
                <td>
                  <Status value={p.status} />
                </td>
                <td>
                  {p.status === "final" && (
                    <button
                      title="Batalkan pembayaran"
                      onClick={() => onCancel(p)}
                    >
                      <Ban size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="Belum ada pembayaran"
            detail="Catat penerimaan customer atau pembayaran ke pemasok, lalu alokasikan ke tagihannya."
            action={
              <button className="primary" onClick={create}>
                Catat pembayaran pertama
              </button>
            }
          />
        )}
      </section>
      {edit && (
        <Modal
          title="Catat pembayaran / pelunasan"
          onClose={() => setEdit(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit(
                  (d) =>
                    savePayment(
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
                      partyId: "",
                      direction: k === "customer" ? "in" : "out",
                    });
                  }}
                >
                  <option value="customer">Penerimaan customer</option>
                  <option value="supplier">Pembayaran pemasok</option>
                </select>
              </Field>
              <Field label="Customer / pemasok">
                <select
                  required
                  value={edit.partyId}
                  onChange={(e) => {
                    setEdit({ ...edit, partyId: e.target.value });
                    setAlloc({});
                  }}
                >
                  <option value="">Pilih kontak</option>
                  {db.parties
                    .filter((p) => p.kind === kind && p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                </select>
              </Field>
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
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={edit.amount}
                  onChange={(e) =>
                    setEdit({ ...edit, amount: Number(e.target.value) })
                  }
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
                          <input
                            aria-label={`Alokasi ${d.number}`}
                            type="number"
                            min="0"
                            max={due(db, d.id)}
                            step="1"
                            value={alloc[d.id] || 0}
                            onChange={(e) =>
                              setAlloc({
                                ...alloc,
                                [d.id]: Number(e.target.value),
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
