import {
  ArrowUpRight,
  ShoppingBag,
  ReceiptText,
  Wallet,
  TrendingUp,
  PackageOpen,
  ArrowRight,
  Plus,
} from "lucide-react";
import { type DB, type Kind, money, qty, dateLabel, today } from "./types";
import {
  metrics,
  activeDocs,
  linesOf,
  balance,
  stock,
  isOrder,
  orderRemaining,
  totalCapital,
} from "./domain";
import { Empty, Table } from "./ui";
export function Dashboard({
  db,
  from,
  to,
  onNew,
  onGo,
}: {
  db: DB;
  from: string;
  to: string;
  onNew: (k: Kind) => void;
  onGo: (s: string) => void;
}) {
  const m = metrics(db, from, to);
  const docs = activeDocs(db).filter(
    (d) => d.kind === "sale" && d.date >= from && d.date <= to,
  );
  const days = Math.max(
    1,
    Math.round(
      (Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) /
        86400000,
    ) + 1,
  );
  const bins = Math.min(7, days);
  const chart = Array.from({ length: bins }, (_, i) => {
    const start = Date.parse(`${from}T12:00:00`);
    const a = new Date(
      start + Math.floor((days * i) / bins) * 86400000,
    ).toLocaleDateString("sv-SE");
    const b = new Date(
      start + (Math.floor((days * (i + 1)) / bins) - 1) * 86400000,
    ).toLocaleDateString("sv-SE");
    return { date: a, label: dateLabel(a), value: metrics(db, a, b).revenue };
  });
  const max = Math.max(1, ...chart.map((p) => Math.abs(p.value)));
  const ranking = new Map<string, { name: string; total: number }>();
  for (const doc of activeDocs(db).filter(
    (d) =>
      ["sale", "sale_return"].includes(d.kind) &&
      d.date >= from &&
      d.date <= to,
  ))
    for (const l of linesOf(db, doc.id)) {
      const row = ranking.get(l.itemId) || { name: l.name, total: 0 };
      row.total += (doc.kind === "sale" ? 1 : -1) * l.total;
      ranking.set(l.itemId, row);
    }
  const top = [...ranking.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const low = db.items.filter(
    (i) => i.active && stock(db, i.id).qty <= i.minStock,
  );
  const receivables = db.parties
    .filter((p) => p.kind === "customer")
    .reduce((s, p) => s + balance(db, p.id, to), 0);
  const payable = db.parties
    .filter((p) => p.kind === "supplier")
    .reduce((s, p) => s + balance(db, p.id, to), 0);
  return (
    <>
      <div className="welcome">
        <div>
          <h2>Catatan rapi. Usaha terkendali.</h2>
          <p>Pantau penjualan dan operasional toko dalam satu tempat.</p>
        </div>
        <button className="primary" onClick={() => onNew("sale")}>
          <Plus size={17} />
          Penjualan baru
        </button>
      </div>
      {!db.items.length && (
        <div className="onboarding">
          <div>
            <strong>Siapkan toko untuk transaksi pertama</strong>
            <p>
              Lengkapi profil toko, tambahkan barang dan kontak. Dashboard akan
              terisi dari transaksi kamu.
            </p>
          </div>
          <div className="actions">
            <button onClick={() => onGo("settings")}>Profil toko</button>
            <button onClick={() => onGo("items")}>
              Tambah barang
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      <div className="stats-grid">
        {[
          {
            label: "Total penjualan",
            value: money(m.revenue),
            note: "Bersih setelah retur",
            icon: ShoppingBag,
            page: "reports",
          },
          {
            label: "Total keuntungan",
            value: money(m.profit),
            note: "Laba kotor · HPP rata-rata bergerak",
            icon: TrendingUp,
            page: "reports",
          },
          {
            label: "Total modal",
            value: money(totalCapital(db)),
            note: "Stok awal + pembelian bersih · semua waktu",
            icon: PackageOpen,
            page: "purchase",
          },
          {
            label: "Jumlah transaksi",
            value: String(m.count),
            note: "Penjualan final pada periode ini",
            icon: ReceiptText,
            page: "sale",
          },
          {
            label: "Rata-rata penjualan",
            value: money(m.average),
            note: "Per nota · sebelum retur terpisah",
            icon: Wallet,
            page: "sale",
          },
        ].map(({ label, value, note, icon: Icon, page }) => (
          <button
            className={`stat ${label === "Total modal" ? "capital-stat" : ""}`}
            key={label}
            onClick={() => onGo(page)}
          >
            <div>
              <span>{label}</span>
              <Icon size={20} />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel trend">
          <div className="section-heading">
            <div>
              <h3>Pergerakan penjualan</h3>
              <p>
                {dateLabel(from)} — {dateLabel(to)}
              </p>
            </div>
            <span className="legend">
              <i />
              Penjualan bersih
            </span>
          </div>
          {m.count ||
          activeDocs(db).some(
            (d) => d.kind === "sale_return" && d.date >= from && d.date <= to,
          ) ? (
            <div className="bar-chart">
              {chart.map((p, i) => (
                <div key={i} title={`${p.label}: ${money(p.value)}`}>
                  <small>{money(p.value)}</small>
                  <div className="bar-track">
                    <span
                      style={{
                        height: `${Math.max(2, (Math.abs(p.value) / max) * 100)}%`,
                        background: p.value < 0 ? "#bc4b48" : undefined,
                      }}
                    />
                  </div>
                  <label>{p.label}</label>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Grafik menunggu transaksi pertama"
              detail="Penjualan yang sudah disahkan akan membentuk tren di sini."
            />
          )}
        </section>
        <section className="panel balance-panel">
          <div className="section-heading">
            <h3>Posisi usaha</h3>
            <Wallet size={19} />
          </div>
          <p className="muted">Saldo sampai {dateLabel(to)}</p>
          <button onClick={() => onGo("reports")}>
            <span>Piutang customer</span>
            <strong>{money(receivables)}</strong>
            <ArrowUpRight size={16} />
          </button>
          <button onClick={() => onGo("reports")}>
            <span>Hutang pembelian</span>
            <strong>{money(payable)}</strong>
            <ArrowUpRight size={16} />
          </button>
          <div className="balance-row">
            <span>Pembayaran customer pada periode</span>
            <b>{money(m.received)}</b>
          </div>
          <div className="balance-row">
            <span>Pembelian bersih pada periode</span>
            <b>{money(m.purchases)}</b>
          </div>
          <div className="balance-row">
            <span>Order belum selesai (saat ini)</span>
            <b>
              {
                activeDocs(db).filter(
                  (d) => isOrder(d.kind) && orderRemaining(db, d) > 0,
                ).length
              }
            </b>
          </div>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <h3>Transaksi terbaru</h3>
            <button className="text-button" onClick={() => onGo("sale")}>
              Lihat semua
              <ArrowRight size={15} />
            </button>
          </div>
          {docs.length ? (
            <Table headers={["Nota", "Customer", "Tanggal", "Total"]}>
              {docs
                .slice()
                .reverse()
                .slice(0, 5)
                .map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.number}</strong>
                    </td>
                    <td>{d.partyName}</td>
                    <td>{dateLabel(d.date)}</td>
                    <td>{money(d.total)}</td>
                  </tr>
                ))}
            </Table>
          ) : (
            <Empty
              title="Belum ada penjualan pada periode ini"
              detail="Buat penjualan baru atau ubah filter tanggal."
            />
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>Produk terlaris</h3>
            <span className="muted">Nilai penjualan bersih</span>
          </div>
          {top.length ? (
            <div className="ranking">
              {top.map((p, i) => (
                <div key={`${p.name}-${i}`}>
                  <span>{i + 1}</span>
                  <strong>{p.name}</strong>
                  <b>{money(p.total)}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Belum ada produk terjual"
              detail="Peringkat mengikuti periode yang dipilih."
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>Perlu diperhatikan</h3>
            <p>Stok terkini · {dateLabel(today())}</p>
          </div>
          <span className="badge warning">{low.length} barang</span>
        </div>
        {low.length ? (
          <div className="low-list">
            {low.slice(0, 8).map((i) => (
              <button key={i.id} onClick={() => onGo("items")}>
                <PackageOpen size={22} />
                <div>
                  <strong>{i.name}</strong>
                  <small>{i.code}</small>
                </div>
                <span>
                  {qty(stock(db, i.id).qty)} {i.unit}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="quiet-note">Tidak ada barang di bawah batas minimum.</p>
        )}
      </section>
    </>
  );
}
