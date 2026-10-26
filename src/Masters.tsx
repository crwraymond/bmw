import { ImportCSV } from "./ImportCSV";
import { exportData } from "./dataImport";
import { NumberInput } from "./inputs";
import { saveCatalogItem, reviseParty, deleteMaster } from "./revisions";
import { useState } from "react";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import { type DB, type Item, type Party, uid, money, qty } from "./types";
import { stock, balance, saveParty, audit } from "./domain";
import {
  type Commit,
  Modal,
  Field,
  Empty,
  Table,
  Status,
  Toolbar,
  DeleteConfirm,
} from "./ui";
import { exportCSV } from "./storage";
export function Masters({
  db,
  kind,
  commit,
  busy,
}: {
  db: DB;
  kind: "items" | "customer";
  commit: Commit;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<Item | Party | null>(null);
  const [deleting, setDeleting] = useState<Item | Party | null>(null);
  const items = kind === "items";
  const list = (
    items ? db.items : db.parties.filter((p) => p.kind === kind)
  ).filter(
    (x) =>
      (inactive || x.active) &&
      `${x.code} ${x.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const create = () =>
    setEditing(
      items
        ? {
            id: uid(),
            code: "",
            name: "",
            unit: "pcs",
            pack: "",
            buyPrice: 0,
            sellPrice: 0,
            openingQty: 0,
            openingCost: 0,
            minStock: 0,
            active: true,
          }
        : {
            id: uid(),
            kind,
            code: "",
            name: "",
            address: "",
            city: "",
            phone: "",
            fax: "",
            openingBalance: 0,
            active: true,
          },
    );
  const toggle = async (value: Item | Party) => {
    await commit((d) => {
      const row = (items ? d.items : d.parties).find((x) => x.id === value.id)!;
      row.active = !row.active;
      audit(d, row.active ? "Aktifkan master" : "Nonaktifkan master", row.code);
    }, "Status diperbarui");
  };
  const csv = () => {
    const data = exportData(
      db,
      kind,
      list.map((x) => x.id),
    );
    exportCSV(`${kind}.csv`, data.headers, data.rows);
  };
  return (
    <>
      <Toolbar search={search} setSearch={setSearch} onExport={csv}>
        <ImportCSV db={db} target={kind} commit={commit} busy={busy} />
        <label className="check">
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => setInactive(e.target.checked)}
          />
          Tampilkan nonaktif
        </label>
        <button className="primary" onClick={create}>
          <Plus size={17} />
          Tambah {items ? "barang" : "customer"}
        </button>
      </Toolbar>
      <section className="panel">
        {list.length ? (
          <Table
            headers={
              items
                ? [
                    "Barang",
                    "Satuan",
                    "Stok tersedia",
                    "Harga beli",
                    "Harga jual",
                    "Status",
                    "",
                  ]
                : [
                    "Kontak",
                    "Telepon",
                    "Alamat",
                    "Saldo berjalan",
                    "Status",
                    "",
                  ]
            }
          >
            {list.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.name}</strong>
                  <small>{x.code}</small>
                </td>
                {items ? (
                  <>
                    <td>{(x as Item).unit}</td>
                    <td>
                      <span
                        className={
                          stock(db, x.id).qty <= (x as Item).minStock
                            ? "low-stock"
                            : ""
                        }
                      >
                        {qty(stock(db, x.id).qty)}
                      </span>
                    </td>
                    <td>{money((x as Item).buyPrice)}</td>
                    <td>{money((x as Item).sellPrice)}</td>
                  </>
                ) : (
                  <>
                    <td>{(x as Party).phone || "—"}</td>
                    <td className="wrap">
                      {[(x as Party).address, (x as Party).city]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td>{money(balance(db, x.id))}</td>
                  </>
                )}
                <td>
                  <Status value={x.active ? "active" : "inactive"} />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      disabled={busy}
                      aria-label={`Hapus ${x.name}`}
                      title="Hapus data"
                      onClick={() => setDeleting(x)}
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      aria-label={`Ubah ${x.name}`}
                      onClick={() => setEditing({ ...x })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      disabled={busy}
                      title={x.active ? "Nonaktifkan" : "Aktifkan"}
                      onClick={() => toggle(x)}
                    >
                      <Power size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title={
              search
                ? "Data tidak ditemukan"
                : `Belum ada ${items ? "barang" : "customer"}`
            }
            detail={
              search
                ? "Coba kata pencarian lain."
                : "Tambahkan data pertama untuk mulai mencatat transaksi."
            }
            action={
              <button className="primary" onClick={create}>
                <Plus size={16} />
                Tambah data
              </button>
            }
          />
        )}
      </section>
      {deleting && (
        <DeleteConfirm
          name={`${items ? "barang" : "customer"} ${deleting.code} — ${deleting.name}`}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async (reportError) => {
            if (
              await commit(
                (d) => deleteMaster(d, kind, deleting.id),
                "Data dihapus",
                reportError,
              )
            )
              setDeleting(null);
          }}
        />
      )}
      {editing && (
        <Modal
          title={`${list.some((x) => x.id === editing.id) ? "Ubah" : "Tambah"} ${items ? "barang" : "customer"}`}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit(
                  (d) =>
                    items
                      ? saveCatalogItem(d, editing as Item)
                      : (d.parties.some((p) => p.id === editing.id)
                          ? reviseParty
                          : saveParty)(d, editing as Party),
                  "Data tersimpan",
                )
              )
                setEditing(null);
            }}
          >
            <div className="form-grid">
              <Field label="Kode">
                <input
                  required
                  value={editing.code}
                  onChange={(e) =>
                    setEditing({ ...editing, code: e.target.value })
                  }
                />
              </Field>
              <Field label="Nama">
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </Field>
              {items ? (
                <>
                  {(["unit", "pack"] as const).map((key, i) => (
                    <Field
                      key={key}
                      label={["Satuan", "Isi / kemasan (keterangan)"][i]}
                      hint={
                        key === "pack"
                          ? "Keterangan saja; stok dicatat dalam satu satuan dasar."
                          : undefined
                      }
                    >
                      <input
                        required={key === "unit"}
                        value={(editing as Item)[key]}
                        onChange={(e) =>
                          setEditing({ ...editing, [key]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                  {(["buyPrice", "sellPrice", "minStock"] as const).map(
                    (key, i) => (
                      <Field
                        key={key}
                        label={
                          [
                            "Harga beli default (Rp)",
                            "Harga jual default (Rp)",
                            "Batas stok minimum",
                          ][i]
                        }
                      >
                        <NumberInput
                          min="0"
                          decimals={key === "minStock" ? 3 : 0}
                          required
                          value={(editing as Item)[key]}
                          onValueChange={(value) =>
                            setEditing({
                              ...editing,
                              [key]: value,
                            })
                          }
                        />
                      </Field>
                    ),
                  )}
                </>
              ) : (
                <>
                  {(["address", "city", "phone", "fax"] as const).map(
                    (key, i) => (
                      <Field
                        key={key}
                        label={
                          [
                            "Alamat",
                            "Kota",
                            "Telepon / contact person",
                            "Fax (opsional)",
                          ][i]
                        }
                      >
                        <input
                          value={(editing as Party)[key]}
                          onChange={(e) =>
                            setEditing({ ...editing, [key]: e.target.value })
                          }
                        />
                      </Field>
                    ),
                  )}
                  <Field
                    label="Saldo awal (Rp)"
                    hint="Positif = tagihan belum dibayar; negatif = saldo kredit."
                  >
                    <NumberInput
                      required
                      value={(editing as Party).openingBalance}
                      onValueChange={(value) =>
                        setEditing({
                          ...editing,
                          openingBalance: value,
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </div>
            {items && (
              <p className="form-note">
                Barang baru dimulai dengan stok 0. Catat dan sahkan pembelian
                untuk menambah stok serta modal; harga beli default tidak
                menambah stok.
                {db.items.some(
                  (i) => i.id === editing.id && i.openingQty > 0,
                ) && <> Stok awal dari data lama tetap dipertahankan.</>}
              </p>
            )}
            <footer className="modal-footer">
              <button type="button" onClick={() => setEditing(null)}>
                Batal
              </button>
              <button className="primary" disabled={busy}>
                Simpan
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
