import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Eye, Pencil } from "lucide-react";
import {
  type DB,
  type Doc,
  type Line,
  type Kind,
  uid,
  labels,
  money,
  qty,
  dateLabel,
} from "./types";
import {
  activeDocs,
  linesOf,
  newDoc,
  newLine,
  saveDoc,
  isOrder,
  isReturn,
  partyKind,
  stock,
  due,
  paid,
  orderRemaining,
  returned,
} from "./domain";
import { type Commit, Toolbar, Empty, Table, Status, Modal, Field } from "./ui";
import { exportCSV } from "./storage";
export function DocumentList({
  db,
  kind,
  commit,
  busy,
  onView,
  openNew = false,
  onOpened,
}: {
  db: DB;
  kind: Kind;
  commit: Commit;
  busy: boolean;
  onView: (d: Doc) => void;
  openNew?: boolean;
  onOpened: () => void;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const [edit, setEdit] = useState<Doc | null>(
    openNew ? newDoc(db, kind) : null,
  );
  const docs = db.documents
    .filter(
      (d) =>
        d.kind === kind &&
        (state === "all" || d.status === state) &&
        `${d.number} ${d.partyName}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice()
    .reverse();
  return (
    <>
      <Toolbar
        search={search}
        setSearch={setSearch}
        onExport={() =>
          exportCSV(
            `${kind}.csv`,
            ["Nomor", "Tanggal", "Pihak", "Total", "Status"],
            docs.map((d) => [d.number, d.date, d.partyName, d.total, d.status]),
          )
        }
      >
        <select
          aria-label="Status dokumen"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="all">Semua status</option>
          <option value="final">Final</option>
          <option value="draft">Draf</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <button className="primary" onClick={() => setEdit(newDoc(db, kind))}>
          <Plus size={17} />
          {labels[kind]} baru
        </button>
      </Toolbar>
      <section className="panel">
        {docs.length ? (
          <Table
            headers={[
              "Dokumen",
              "Customer / pemasok",
              "Total",
              isOrder(kind) ? "Sisa order" : "Sisa tagihan",
              "Status",
              "",
            ]}
          >
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.number}</strong>
                  <small>{dateLabel(d.date)}</small>
                </td>
                <td>{d.partyName}</td>
                <td>{money(d.total)}</td>
                <td>
                  {d.status !== "final"
                    ? "—"
                    : isOrder(kind)
                      ? qty(orderRemaining(db, d))
                      : isReturn(kind)
                        ? "—"
                        : money(due(db, d.id))}
                </td>
                <td>
                  <Status value={d.status} />
                </td>
                <td>
                  <div className="row-actions">
                    <button title="Lihat detail" onClick={() => onView(d)}>
                      <Eye size={16} />
                    </button>
                    {d.status === "draft" && (
                      <button
                        title="Lanjutkan draf"
                        onClick={() => setEdit({ ...d })}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title={
              search
                ? "Dokumen tidak ditemukan"
                : `Belum ada ${labels[kind].toLowerCase()}`
            }
            detail="Dokumen yang disahkan akan memperbarui data terkait secara otomatis."
            action={
              <button
                className="primary"
                onClick={() => setEdit(newDoc(db, kind))}
              >
                <Plus size={16} />
                Buat dokumen pertama
              </button>
            }
          />
        )}
      </section>
      {edit && (
        <Editor
          key={edit.id}
          db={db}
          initial={edit}
          commit={commit}
          busy={busy}
          onClose={() => {
            setEdit(null);
            onOpened();
          }}
        />
      )}
    </>
  );
}
export function Editor({
  db,
  initial,
  commit,
  busy,
  onClose,
}: {
  db: DB;
  initial: Doc;
  commit: Commit;
  busy: boolean;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === "F1" ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")
      ) {
        event.preventDefault();
        if (!busy) formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [busy]);
  const [doc, setDoc] = useState({ ...initial });
  const [lines, setLines] = useState<Line[]>(
    linesOf(db, initial.id).map((l) => ({ ...l })),
  );
  const [item, setItem] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const isRet = isReturn(doc.kind);
  const parties = db.parties.filter(
    (p) => p.kind === partyKind(doc.kind) && p.active,
  );
  const parent = db.documents.find((d) => d.id === doc.refId);
  const patch = (i: number, key: keyof Line, value: string | number) =>
    setLines(lines.map((l, n) => (n === i ? { ...l, [key]: value } : l)));
  const chooseParent = (id: string) => {
    const p = db.documents.find((d) => d.id === id);
    setDoc({ ...doc, refId: id, partyId: p?.partyId || "" });
    setLines(
      p
        ? linesOf(db, p.id)
            .filter((l) => l.qty - returned(db, l.id) > 0)
            .map((l) => ({
              ...l,
              id: uid(),
              docId: doc.id,
              refLineId: l.id,
              qty: Math.round((l.qty - returned(db, l.id)) * 1000) / 1000,
            }))
        : [],
    );
  };
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0);
  const save = async (final: boolean) => {
    if (
      await commit(
        (d) => saveDoc(d, doc, lines, final),
        final ? "Dokumen disahkan" : "Draf tersimpan",
      )
    )
      onClose();
  };
  return (
    <Modal title={`${labels[doc.kind]} baru`} onClose={onClose} wide>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
      >
        <div className="form-grid three">
          <Field label="Nomor dokumen">
            <input
              required
              value={doc.number}
              onChange={(e) => setDoc({ ...doc, number: e.target.value })}
            />
          </Field>
          <Field label="Tanggal">
            <input
              type="date"
              required
              value={doc.date}
              onChange={(e) => setDoc({ ...doc, date: e.target.value })}
            />
          </Field>
          <Field
            label={
              partyKind(doc.kind) === "customer"
                ? "Customer"
                : "Pabrik / pemasok"
            }
          >
            <select
              required
              value={doc.partyId}
              disabled={isRet}
              onChange={(e) =>
                setDoc({ ...doc, partyId: e.target.value, orderId: "" })
              }
            >
              <option value="">Pilih kontak</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          {isRet && (
            <Field label="Transaksi asal">
              <select
                required
                value={doc.refId}
                onChange={(e) => chooseParent(e.target.value)}
              >
                <option value="">Pilih transaksi asal</option>
                {activeDocs(db)
                  .filter(
                    (d) =>
                      d.kind ===
                      (doc.kind === "sale_return" ? "sale" : "purchase"),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.number} — {d.partyName}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {["sale", "purchase"].includes(doc.kind) && (
            <Field label="Tautkan order (opsional)">
              <select
                value={doc.orderId}
                onChange={(e) => {
                  const order = db.documents.find(
                    (d) => d.id === e.target.value,
                  );
                  setDoc({ ...doc, orderId: e.target.value });
                  if (order)
                    setLines(
                      linesOf(db, order.id)
                        .map((l) => ({
                          ...newLine(db, doc.id, l.itemId, doc.kind),
                          qty: Math.max(
                            0,
                            l.qty -
                              activeDocs(db)
                                .filter((d) => d.orderId === order.id)
                                .flatMap((d) => linesOf(db, d.id))
                                .filter((x) => x.itemId === l.itemId)
                                .reduce((s, x) => s + x.qty, 0),
                          ),
                          price: l.price,
                        }))
                        .filter((l) => l.qty > 0),
                    );
                }}
              >
                <option value="">Tanpa order</option>
                {activeDocs(db)
                  .filter(
                    (d) =>
                      d.kind ===
                        (doc.kind === "sale"
                          ? "customer_order"
                          : "supplier_order") &&
                      d.partyId === doc.partyId &&
                      orderRemaining(db, d) > 0,
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.number}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>
        {!isRet && (
          <div className="add-line">
            <input
              aria-label="Cari barang transaksi"
              placeholder="Cari kode atau nama barang…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <select
              aria-label="Pilih barang"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            >
              <option value="">Pilih barang</option>
              {db.items
                .filter(
                  (i) =>
                    i.active &&
                    !lines.some((l) => l.itemId === i.id) &&
                    `${i.code} ${i.name}`
                      .toLowerCase()
                      .includes(itemSearch.toLowerCase()),
                )
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} — {i.name} (stok {qty(stock(db, i.id).qty)})
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!item}
              onClick={() => {
                setLines([...lines, newLine(db, doc.id, item, doc.kind)]);
                setItem("");
                setItemSearch("");
              }}
            >
              <Plus size={16} />
              Tambah baris
            </button>
          </div>
        )}
        {lines.length ? (
          <Table
            headers={[
              "Barang",
              "Qty",
              "Harga / unit (Rp)",
              "Serial number (opsional)",
              "Subtotal",
              "",
            ]}
          >
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.name}</strong>
                  <small>
                    {l.code} · {l.unit}
                    {isRet && parent
                      ? ` · sisa ${qty((linesOf(db, parent.id).find((x) => x.id === l.refLineId)?.qty || 0) - returned(db, l.refLineId))}`
                      : ""}
                  </small>
                </td>
                <td>
                  <input
                    aria-label={`Qty ${l.name}`}
                    className="qty-input"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={l.qty}
                    onChange={(e) => patch(i, "qty", Number(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Harga ${l.name}`}
                    className="price-input"
                    type="number"
                    min="0"
                    step="1"
                    required
                    disabled={isRet}
                    value={l.price}
                    onChange={(e) => patch(i, "price", Number(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    aria-label={`SN ${l.name}`}
                    placeholder="Pisahkan dengan koma"
                    value={l.serials}
                    onChange={(e) => patch(i, "serials", e.target.value)}
                  />
                </td>
                <td>{money(Math.round(l.qty * l.price))}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Hapus ${l.name}`}
                    className="icon-button"
                    onClick={() => setLines(lines.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <div className="inline-empty">
            {isRet
              ? "Pilih transaksi asal untuk mengambil barang yang dapat diretur."
              : "Tambahkan barang ke dokumen."}
          </div>
        )}
        <div className="editor-bottom">
          <div>
            <Field label="Catatan / alasan">
              <textarea
                value={doc.notes}
                onChange={(e) => setDoc({ ...doc, notes: e.target.value })}
              />
            </Field>
            {doc.kind === "sale" && (
              <Field label="Syarat pembayaran">
                <textarea
                  value={doc.terms}
                  onChange={(e) => setDoc({ ...doc, terms: e.target.value })}
                />
              </Field>
            )}
          </div>
          <div className="total-box">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            {doc.kind === "sale" && (
              <Field
                label="Uang muka / dibayar sekarang (Rp)"
                hint="Dicatat otomatis sebagai pembayaran saat disahkan."
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={doc.downPayment}
                  onChange={(e) =>
                    setDoc({ ...doc, downPayment: Number(e.target.value) })
                  }
                />
              </Field>
            )}
            {!isRet && (
              <Field label="Diskon total (Rp)">
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  step="1"
                  value={doc.discount}
                  onChange={(e) =>
                    setDoc({ ...doc, discount: Number(e.target.value) })
                  }
                />
              </Field>
            )}
            <div className="grand">
              <span>{isRet ? "Perkiraan sebelum diskon asal" : "Total"}</span>
              <strong>{money(Math.max(0, subtotal - doc.discount))}</strong>
            </div>
            {isRet && (
              <small>
                Nilai final mengikuti alokasi diskon transaksi asal.
              </small>
            )}
          </div>
        </div>
        <p className="form-note">
          {isOrder(doc.kind)
            ? "Order tidak mengubah stok. Buat transaksi terkait untuk pemenuhan."
            : isRet
              ? "Retur penjualan masuk kembali sebagai stok layak jual. Saldo berlebih menjadi kredit pihak terkait."
              : "Dokumen final mengubah stok dan tagihan. Pembayaran dicatat terpisah di menu Pelunasan."}
        </p>
        <footer className="modal-footer">
          <button type="button" disabled={busy} onClick={() => save(false)}>
            Simpan draf
          </button>
          <button className="primary" disabled={busy || !lines.length}>
            Sahkan {labels[doc.kind].toLowerCase()}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Detail({
  db,
  doc,
  onClose,
  onCancel,
  onDelete,
  onPrint,
}: {
  db: DB;
  doc: Doc;
  onClose: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onPrint: (mode: "normal" | "copy" | "both") => void;
}) {
  return (
    <Modal title={doc.number} onClose={onClose} wide>
      <div className="detail-header">
        <div>
          <Status value={doc.status} />
          <h3>
            {labels[doc.kind]} · {doc.partyName}
          </h3>
          <p>{dateLabel(doc.date)}</p>
        </div>
        <strong className="detail-total">{money(doc.total)}</strong>
      </div>
      <Table
        headers={[
          "Barang",
          "Qty",
          "Harga",
          "Nilai bersih",
          "HPP",
          "Serial number",
        ]}
      >
        {linesOf(db, doc.id).map((l) => (
          <tr key={l.id}>
            <td>
              <strong>{l.name}</strong>
              <small>{l.code}</small>
            </td>
            <td>
              {qty(l.qty)} {l.unit}
            </td>
            <td>{money(l.price)}</td>
            <td>{money(l.total)}</td>
            <td>{isOrder(doc.kind) ? "—" : money(l.cost)}</td>
            <td className="wrap">{l.serials || "—"}</td>
          </tr>
        ))}
      </Table>
      <div className="detail-meta">
        <p>Catatan: {doc.notes || "—"}</p>
        {doc.status === "cancelled" && (
          <p>Alasan pembatalan: {doc.cancelReason}</p>
        )}
        {["sale", "purchase"].includes(doc.kind) && doc.status === "final" && (
          <p>
            Pembayaran teralokasi: {money(paid(db, doc.id))} · Sisa tagihan:{" "}
            {money(due(db, doc.id))}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        {doc.status === "draft" && (
          <button className="danger" onClick={onDelete}>
            Hapus draf
          </button>
        )}
        {doc.status === "final" && (
          <button className="danger" onClick={onCancel}>
            Batalkan dokumen
          </button>
        )}
        {doc.kind === "sale" && doc.status === "final" && (
          <>
            <button onClick={() => onPrint("copy")}>Cetak COPY</button>
            <button onClick={() => onPrint("both")}>Cetak keduanya</button>
            <button className="primary" onClick={() => onPrint("normal")}>
              Cetak invoice
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
