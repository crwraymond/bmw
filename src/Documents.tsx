import { NumberInput, SearchSelect } from "./inputs";
import { SerialInputs } from "./SerialInputs";
import { serialText } from "./serials";
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
  lineGross,
  lineDiscount,
  lineNet,
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
              ...(partyKind(kind) === "customer" ? ["Customer"] : []),
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
                {partyKind(kind) === "customer" && <td>{d.partyName}</td>}
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
  const itemInput = useRef<HTMLInputElement>(null);
  const [itemMessage, setItemMessage] = useState("");
  const matches = db.items.filter(
    (i) =>
      i.active &&
      `${i.code} ${i.name}`
        .toLowerCase()
        .includes(itemSearch.trim().toLowerCase()),
  );
  const exact = db.items.find(
    (i) => i.active && i.code.toLowerCase() === itemSearch.trim().toLowerCase(),
  );
  const candidate =
    db.items.find((i) => i.id === item) ||
    exact ||
    (itemSearch.trim() && matches.length === 1 ? matches[0] : undefined);
  const addItem = () => {
    if (!candidate) {
      setItemMessage(
        matches.length > 1
          ? "Ada beberapa barang yang cocok. Pilih barang yang dimaksud."
          : "Kode barang tidak ditemukan. Tambahkan barang di menu Barang & stok terlebih dahulu.",
      );
      return;
    }
    setLines((current) => {
      const found = current.find((l) => l.itemId === candidate.id);
      return found
        ? current.map((l) =>
            l.id === found.id
              ? { ...l, qty: Math.round((l.qty + 1) * 1000) / 1000 }
              : l,
          )
        : [...current, newLine(db, doc.id, candidate.id, doc.kind)];
    });
    setItem("");
    setItemSearch("");
    setItemMessage("");
    itemInput.current?.focus();
  };
  const previewTotal = (line: Line) => {
    if (!isRet || !parent) return lineNet(line);
    const origin = linesOf(db, parent.id).find((l) => l.id === line.refLineId);
    if (!origin) return 0;
    const done = returned(db, origin.id, doc.id);
    return (
      Math.round((origin.total * (done + line.qty)) / origin.qty) -
      Math.round((origin.total * done) / origin.qty)
    );
  };
  const gross = lines.reduce((s, l) => s + lineGross(l), 0);
  const productDiscount = lines.reduce((s, l) => s + lineDiscount(l), 0);
  const subtotal = lines.reduce((s, l) => s + previewTotal(l), 0);
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
          {partyKind(doc.kind) === "customer" && (
            <Field label="Customer">
              <SearchSelect
                required
                value={doc.partyId}
                disabled={isRet}
                placeholder="Cari kode atau nama customer…"
                options={parties.map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}`,
                  search: `${p.phone} ${p.city}`,
                }))}
                onChange={(value) =>
                  setDoc({ ...doc, partyId: value, orderId: "" })
                }
              />
            </Field>
          )}
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
                          discountType: l.discountType ?? "amount",
                          discountValue: l.discountValue ?? 0,
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
          <div className="add-product">
            <div className="add-line">
              <input
                ref={itemInput}
                aria-label="Cari barang transaksi"
                placeholder="Ketik kode lalu Enter…"
                value={itemSearch}
                onChange={(e) => {
                  const query = e.target.value;
                  setItemSearch(query);
                  setItem(
                    db.items.find(
                      (i) =>
                        i.active &&
                        i.code.toLowerCase() === query.trim().toLowerCase(),
                    )?.id || "",
                  );
                  setItemMessage("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    addItem();
                  }
                }}
              />
              <SearchSelect
                aria-label="Pilih barang"
                value={item}
                placeholder="Cari atau pilih barang…"
                options={(itemSearch.trim()
                  ? matches
                  : db.items.filter((i) => i.active)
                ).map((i) => ({
                  value: i.id,
                  label: `${i.code} — ${i.name}`,
                  detail: `Stok ${qty(stock(db, i.id).qty)} ${i.unit}`,
                }))}
                onChange={setItem}
              />
              <button type="button" disabled={!candidate} onClick={addItem}>
                <Plus size={16} />
                Tambah baris
              </button>
            </div>
            {itemMessage && (
              <p className="item-message" role="status">
                {itemMessage}
              </p>
            )}
          </div>
        )}
        {lines.length ? (
          <Table
            headers={[
              "Barang",
              "Qty",
              "Harga / unit (Rp)",
              "Diskon produk",
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
                  <NumberInput
                    aria-label={`Qty ${l.name}`}
                    className="qty-input"
                    min="0.001"
                    decimals={3}
                    required
                    value={l.qty}
                    onValueChange={(value) => patch(i, "qty", value)}
                  />
                </td>
                <td>
                  <NumberInput
                    aria-label={`Harga ${l.name}`}
                    className="price-input"
                    min="0"
                    required
                    disabled={isRet}
                    value={l.price}
                    onValueChange={(value) => patch(i, "price", value)}
                  />
                </td>
                <td>
                  {isRet ? (
                    <small>Sesuai nota asal</small>
                  ) : (
                    <div className="line-discount-input">
                      <select
                        aria-label={`Jenis diskon ${l.name}`}
                        value={l.discountType ?? "amount"}
                        onChange={(e) =>
                          setLines(
                            lines.map((line, n) =>
                              n === i
                                ? {
                                    ...line,
                                    discountType: e.target.value as
                                      "amount" | "percent",
                                    discountValue: 0,
                                  }
                                : line,
                            ),
                          )
                        }
                      >
                        <option value="amount">Rp/unit</option>
                        <option value="percent">%</option>
                      </select>
                      <NumberInput
                        aria-label={`Diskon ${l.name}`}
                        min={0}
                        max={l.discountType === "percent" ? 100 : l.price}
                        decimals={l.discountType === "percent" ? 2 : 0}
                        required
                        value={l.discountValue ?? 0}
                        onValueChange={(value) =>
                          patch(i, "discountValue", value)
                        }
                      />
                    </div>
                  )}
                </td>
                <td>
                  <SerialInputs
                    name={l.name}
                    quantity={l.qty}
                    value={l.serials}
                    onChange={(value) => patch(i, "serials", value)}
                  />
                </td>
                <td>{money(previewTotal(l))}</td>
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
              <strong>{money(isRet ? subtotal : gross)}</strong>
            </div>
            {!isRet && productDiscount > 0 && (
              <>
                <div>
                  <span>Diskon produk</span>
                  <strong>−{money(productDiscount)}</strong>
                </div>
                <div>
                  <span>Setelah diskon produk</span>
                  <strong>{money(subtotal)}</strong>
                </div>
              </>
            )}
            {doc.kind === "sale" && (
              <Field
                label="Uang muka / dibayar sekarang (Rp)"
                hint="Dicatat otomatis sebagai pembayaran saat disahkan."
              >
                <NumberInput
                  min="0"
                  value={doc.downPayment}
                  onValueChange={(value) =>
                    setDoc({ ...doc, downPayment: value })
                  }
                />
              </Field>
            )}
            {!isRet && (
              <Field
                label="Diskon total (Rp)"
                hint="Diskon tambahan setelah diskon per produk."
              >
                <NumberInput
                  min="0"
                  max={subtotal}
                  value={doc.discount}
                  onValueChange={(value) => setDoc({ ...doc, discount: value })}
                />
              </Field>
            )}
            <div className="grand">
              <span>Total</span>
              <strong>{money(Math.max(0, subtotal - doc.discount))}</strong>
            </div>
            {isRet && (
              <small>
                Nilai retur mengikuti diskon produk dan alokasi diskon total
                pada transaksi asal.
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
          "Diskon produk",
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
            <td>
              {isReturn(doc.kind) ? "Sesuai nota asal" : money(lineDiscount(l))}
            </td>
            <td>{money(l.total)}</td>
            <td>{isOrder(doc.kind) ? "—" : money(l.cost)}</td>
            <td className="wrap">{serialText(l.serials) || "—"}</td>
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
