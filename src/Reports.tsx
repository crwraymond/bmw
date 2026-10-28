import { SearchSelect } from "./inputs";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { compareCodes, type DB, money, qty, dateLabel, labels } from "./types";
import {
  activeDocs,
  linesOf,
  stock,
  balance,
  metrics,
  isOrder,
  orderRemaining,
  fulfilled,
  inventoryCapital,
  totalCapital,
} from "./domain";
import { Table, Empty, Field } from "./ui";
import { exportCSV, printDocument } from "./storage";
const options = [
  ["customers", "Data customer"],
  ["stock", "Stok barang"],
  ["sold", "Total barang terjual"],
  ["customer_order", "Order customer"],
  ["supplier_order", "Order pembelian"],
  ["order_total", "Total order customer"],
  ["order_customer", "Order per customer"],
  ["sale", "Transaksi penjualan"],
  ["purchase", "Transaksi pembelian"],
  ["sale_return", "Retur penjualan"],
  ["purchase_return", "Retur pembelian"],
  ["receivable", "Hutang customer / piutang"],
  ["payable", "Hutang pembelian"],
  ["receivable_total", "Hutang total customer"],
  ["profit", "Modal / laba"],
];
export function Reports({
  db,
  from,
  to,
  onError,
}: {
  db: DB;
  from: string;
  to: string;
  onError: (s: string) => void;
}) {
  const [report, setReport] = useState("sale");
  const [codeFrom, setCodeFrom] = useState("");
  const [codeTo, setCodeTo] = useState("");
  const [party, setParty] = useState("");
  const purchasing = [
    "supplier_order",
    "purchase",
    "purchase_return",
    "payable",
  ].includes(report);
  const contact = purchasing ? "" : party;
  const inCode = (s: string) =>
    (!codeFrom || s.localeCompare(codeFrom, "id", { numeric: true }) >= 0) &&
    (!codeTo || s.localeCompare(codeTo, "id", { numeric: true }) <= 0);
  const docs = activeDocs(db).filter(
    (d) =>
      d.date >= from && d.date <= to && (!contact || d.partyId === contact),
  );
  let headers: string[] = [];
  let rows: (string | number)[][] = [];
  let summary = "";
  if (report === "customers") {
    headers = ["Kode", "Nama", "Alamat", "Kota", "Telepon", "Fax"];
    rows = db.parties
      .filter(
        (p) =>
          p.kind === "customer" &&
          !p.deleted &&
          inCode(p.code) &&
          (!contact || p.id === contact),
      )
      .sort(compareCodes)
      .map((p) => [p.code, p.name, p.address, p.city, p.phone, p.fax]);
  } else if (report === "stock") {
    headers = [
      "Kode",
      "Barang",
      "Satuan",
      "Stok saat ini",
      "Nilai stok saat ini",
    ];
    rows = db.items
      .filter((i) => inCode(i.code))
      .sort(compareCodes)
      .map((i) => [
        i.code,
        i.name,
        i.unit,
        qty(stock(db, i.id).qty),
        money(stock(db, i.id).value),
      ]);
    summary =
      "Stok saat ini, termasuk stok awal dan seluruh mutasi. Filter periode tidak diterapkan pada stok terkini.";
  } else if (report === "sold") {
    headers = [
      "Kode",
      "Barang",
      "Satuan",
      "Qty bersih",
      "Penjualan bersih",
      "HPP bersih",
      "Laba kotor",
    ];
    rows = db.items
      .filter((i) => inCode(i.code))
      .sort(compareCodes)
      .map((i) => {
        let q = 0,
          v = 0,
          c = 0;
        for (const d of docs.filter(
          (d) => d.kind === "sale" || d.kind === "sale_return",
        ))
          for (const l of linesOf(db, d.id).filter((l) => l.itemId === i.id)) {
            const s = d.kind === "sale" ? 1 : -1;
            q += s * l.qty;
            v += s * l.total;
            c += s * l.cost;
          }
        return [
          i.code,
          i.name,
          i.unit,
          qty(q),
          money(v),
          money(c),
          money(v - c),
        ];
      });
  } else if (["receivable", "payable", "receivable_total"].includes(report)) {
    headers = ["Kode", "Kontak", "Jenis", "Saldo sampai tanggal akhir"];
    const parties = db.parties.filter(
      (p) =>
        p.kind === (report === "payable" ? "supplier" : "customer") &&
        inCode(p.code) &&
        (!contact || contact === p.id),
    );
    rows = parties
      .sort(compareCodes)
      .map((p) => [
        p.code,
        p.name,
        p.kind === "customer" ? "Piutang" : "Hutang",
        money(balance(db, p.id, to)),
      ]);
    summary = `Total saldo: ${money(parties.reduce((s, p) => s + balance(db, p.id, to), 0))}. Termasuk saldo awal; saldo negatif berarti kredit. Tanggal awal tidak membatasi saldo kumulatif.`;
    if (report === "receivable") {
      headers = ["Tanggal", "Dokumen / kontak", "Keterangan", "Nilai"];
      rows = parties.flatMap((p) => [
        [dateLabel(""), p.name, "Saldo awal", money(p.openingBalance)],
        ...activeDocs(db)
          .filter((d) => d.partyId === p.id && d.date <= to && !isOrder(d.kind))
          .map((d) => [
            dateLabel(d.date),
            d.number,
            labels[d.kind],
            money(d.total * (d.kind.endsWith("_return") ? -1 : 1)),
          ]),
        ...db.payments
          .filter(
            (x) => x.partyId === p.id && x.date <= to && x.status === "final",
          )
          .map((x) => [
            dateLabel(x.date),
            x.number,
            "Pembayaran",
            money(-x.amount),
          ]),
      ]);
    }
  } else if (["order_total", "order_customer"].includes(report)) {
    headers = [
      "Kode",
      "Customer",
      "Jumlah order",
      "Nilai order",
      "Sisa pemenuhan per barang",
    ];
    rows = db.parties
      .filter(
        (p) =>
          p.kind === "customer" && (!party || party === p.id) && inCode(p.code),
      )
      .sort(compareCodes)
      .map((p) => {
        const ds = docs.filter(
          (d) => d.partyId === p.id && d.kind === "customer_order",
        );
        return [
          p.code,
          p.name,
          ds.length,
          money(ds.reduce((s, d) => s + d.total, 0)),
          ds
            .map(
              (d) =>
                `${d.number}: ${linesOf(db, d.id)
                  .map(
                    (l) =>
                      `${l.name} ${qty(Math.max(0, l.qty - fulfilled(db, d.id, l.itemId)))} ${l.unit}`,
                  )
                  .join("; ")}`,
            )
            .join("\n"),
        ];
      });
    summary =
      "Order dalam periode; rincian mencantumkan kuantitas per satuan. Pemenuhan/sisa order dapat diperiksa pada detail order.";
  } else if (report === "profit") {
    const m = metrics(db, from, to);
    headers = ["Komponen", "Nilai"];
    rows = [
      ["Penjualan bersih", money(m.revenue)],
      ["HPP bersih", money(m.cogs)],
      ["Laba kotor", money(m.profit)],
      ["Total modal seluruh pembelian", money(totalCapital(db))],
      ["Nilai persediaan saat ini", money(inventoryCapital(db))],
      ["Pembelian bersih periode", money(m.purchases)],
    ];
    summary =
      "Laba kotor memakai HPP rata-rata bergerak yang dikunci saat transaksi. Total modal menjumlahkan nilai stok awal dan seluruh pembelian final setelah retur pembelian, tanpa berkurang saat penjualan. Nilai persediaan menunjukkan modal stok yang masih tersedia. Biaya operasional dan pajak belum dicatat, sehingga ini bukan laba bersih.";
  } else {
    headers = [
      "Tanggal",
      "Nomor",
      "Kontak",
      "Total",
      "Status pemenuhan / catatan",
    ];
    rows = docs
      .filter((d) => d.kind === report)
      .flatMap((d) => {
        const ls = linesOf(db, d.id).filter((l) => inCode(l.code));
        if (!ls.length) return [];
        return [
          [
            dateLabel(d.date),
            d.number,
            d.partyName,
            money(d.total),
            isOrder(d.kind)
              ? orderRemaining(db, d) > 0
                ? "Belum selesai"
                : "Selesai"
              : d.notes || "—",
          ],
        ];
      });
    summary = `${rows.length} dokumen final pada periode. Total dokumen utuh; rentang kode menyaring dokumen yang mengandung barang tersebut.`;
  }
  const title = options.find(([k]) => k === report)![1];
  return (
    <>
      <div className="report-filters">
        <Field label="Jenis laporan">
          <select value={report} onChange={(e) => setReport(e.target.value)}>
            {options.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        {!purchasing && (
          <Field label="Kontak">
            <SearchSelect
              value={party}
              placeholder="Semua kontak / cari…"
              options={[
                { value: "", label: "Semua kontak" },
                ...db.parties
                  .filter((p) => p.kind === "customer")
                  .sort(compareCodes)
                  .map((p) => ({
                    value: p.id,
                    label: `${p.code} — ${p.name}`,
                    search: p.phone,
                  })),
              ]}
              onChange={setParty}
            />
          </Field>
        )}
        <Field label="Dari kode">
          <input
            placeholder="Semua"
            value={codeFrom}
            onChange={(e) => setCodeFrom(e.target.value)}
          />
        </Field>
        <Field label="Sampai kode">
          <input
            placeholder="Semua"
            value={codeTo}
            onChange={(e) => setCodeTo(e.target.value)}
          />
        </Field>
      </div>
      <section
        className="panel report-section"
        id="report-print"
        data-report={report}
      >
        <div className="section-heading">
          <div>
            <h3>{title}</h3>
            <p>
              {db.settings[0].name} · {dateLabel(from)} — {dateLabel(to)}
            </p>
          </div>
          <div className="actions no-print">
            <button
              onClick={() => exportCSV(`laporan-${report}.csv`, headers, rows)}
            >
              <Download size={16} />
              Ekspor CSV
            </button>
            <button
              onClick={async () => {
                try {
                  await printDocument();
                } catch (e) {
                  onError(String(e));
                }
              }}
            >
              <Printer size={16} />
              Cetak
            </button>
          </div>
        </div>
        {summary && <p className="report-note">{summary}</p>}
        {rows.length ? (
          <Table headers={headers}>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, n) => (
                  <td className="wrap" key={n}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="Tidak ada data pada filter ini"
            detail="Ubah periode atau filter untuk melihat data lain."
          />
        )}
      </section>
    </>
  );
}
