import { refreshInvoiceProfile } from "./domain";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Boxes,
  UsersRound,
  ClipboardList,
  ShoppingCart,
  ShoppingBag,
  RotateCcw,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Settings2,
  ChevronRight,
  Check,
  CircleAlert,
  X,
  Menu,
  LockKeyhole,
  HardDrive,
  Store,
  Sun,
  Moon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type DB,
  type Doc,
  type Kind,
  type Payment,
  emptyDB,
  today,
  labels,
} from "./types";
import { cancelDoc, cancelPayment } from "./domain";
import { deleteDocument } from "./revisions";
import { load, persist, desktop, restore } from "./storage";
import { type Commit, Modal, Field } from "./ui";
import { Dashboard } from "./Dashboard";
import { Masters } from "./Masters";
import { DocumentList, Detail, Editor } from "./Documents";
import { defaultLogo, defaultIcon } from "./branding";
import { Payments } from "./Payments";
import { Reports } from "./Reports";
import { Settings } from "./Settings";
import { Invoice } from "./Invoice";
import { DesktopActions } from "./DesktopActions";
import "./App.css";
import "./theme.css";
const sections = [
  {
    title: "Ruang kerja",
    items: [
      { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
      { id: "items", name: "Barang & stok", icon: Boxes },
      { id: "customer", name: "Customer", icon: UsersRound },
    ],
  },
  {
    title: "Operasional",
    items: [
      { id: "sale", name: "Penjualan", icon: ShoppingBag },
      { id: "purchase", name: "Pembelian", icon: ShoppingCart },
      { id: "customer_order", name: "Order customer", icon: ClipboardList },
      { id: "supplier_order", name: "Order pembelian", icon: ClipboardList },
      { id: "sale_return", name: "Retur penjualan", icon: RotateCcw },
      { id: "purchase_return", name: "Retur pembelian", icon: RotateCcw },
      { id: "payments", name: "Pelunasan", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { id: "reports", name: "Laporan", icon: ChartNoAxesCombined },
      { id: "settings", name: "Pengaturan", icon: Settings2 },
    ],
  },
];
const pageTitles = Object.fromEntries(
  sections.flatMap((s) => s.items.map((i) => [i.id, i.name])),
);
function range(preset: string) {
  const end = today(),
    d = new Date(`${end}T12:00:00`);
  if (preset === "today") return [end, end];
  if (preset === "week") {
    d.setDate(d.getDate() - 6);
    return [d.toLocaleDateString("sv-SE"), end];
  }
  if (preset === "year") return [`${end.slice(0, 4)}-01-01`, end];
  if (preset === "all") return ["2000-01-01", end];
  return [`${end.slice(0, 7)}-01`, end];
}
function App() {
  const [theme, setTheme] = useState<"dark" | "light">(
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (desktop) {
      getCurrentWindow()
        .setTheme(theme)
        .catch(() => {
          // Content theme remains available if the native frame cannot change.
        });
    }
    try {
      localStorage.setItem("toko-offline-theme", theme);
    } catch {
      // The selected theme still works when local preferences are unavailable.
    }
  }, [theme]);
  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === "toko-offline-theme")
        setTheme(event.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);
  const [db, setDB] = useState<DB | null>(null),
    dbRef = useRef<DB | null>(null);
  const [path, setPath] = useState(""),
    [fatal, setFatal] = useState(""),
    [locked, setLocked] = useState(false),
    [password, setPassword] = useState("");
  const [page, setPage] = useState("dashboard"),
    [newNonce, setNewNonce] = useState(0),
    [newKind, setNewKind] = useState<Kind | null>(null),
    [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [preset, setPreset] = useState("month"),
    [from, setFrom] = useState(range("month")[0]),
    [to, setTo] = useState(today());
  const [detail, setDetail] = useState<Doc | null>(null),
    [print, setPrint] = useState<{
      doc: Doc;
      mode: "normal" | "copy" | "both";
    } | null>(null);
  const [editRecord, setEditRecord] = useState<Doc | null>(null);
  const [confirmation, setConfirmation] = useState<{
      type: "doc" | "payment" | "delete" | "restore";
      id: string;
      name: string;
    } | null>(null),
    [reason, setReason] = useState("");
  const notify = (text: string, error = false) => setNotice({ text, error });
  const reload = async () => {
    try {
      const result = await load();
      dbRef.current = result.db;
      setDB(result.db);
      setPath(result.path);
      setFatal("");
      setLocked(false);
    } catch (e) {
      const s = String(e);
      if (s.includes("APP_LOCKED")) {
        setLocked(true);
        setFatal("");
      } else setFatal(s);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (db) document.title = db.settings[0].name;
  }, [db]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const commit: Commit = async (change, message = "Tersimpan") => {
    if (busyRef.current || !dbRef.current) {
      notify("Tunggu penyimpanan sebelumnya selesai.", true);
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const next = structuredClone(dbRef.current);
      change(next);
      const saved = await persist(next);
      dbRef.current = saved;
      setDB(saved);
      notify(message);
      return true;
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e), true);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const go = (id: string) => {
    setPage(id);
    setNewKind(null);
    setMobile(false);
  };
  const create = (kind: Kind) => {
    setPage(kind);
    setNewKind(kind);
    setNewNonce((n) => n + 1);
  };
  const ask = (
    type: "doc" | "payment" | "delete" | "restore",
    id: string,
    name: string,
  ) => {
    setReason("");
    setConfirmation({ type, id, name });
  };
  const performRestore = async () => {
    if (busyRef.current) return;
    setBusy(true);
    busyRef.current = true;
    try {
      const result = await restore(dbRef.current || emptyDB());
      if (result) {
        dbRef.current = result;
        setDB(result);
        setFatal("");
        notify("Backup berhasil dipulihkan");
        setPage("dashboard");
      }
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const confirm = async () => {
    if (!confirmation) return;
    if (confirmation.type === "restore") {
      setConfirmation(null);
      await performRestore();
      return;
    }
    const c = confirmation;
    const ok = await commit(
      (d) => {
        if (c.type === "doc") cancelDoc(d, c.id, reason);
        else if (c.type === "payment") cancelPayment(d, c.id, reason);
        else deleteDocument(d, c.id);
      },
      c.type === "delete" ? "Dokumen dihapus" : "Pembatalan tersimpan",
    );
    if (ok) {
      setConfirmation(null);
      setDetail(null);
    }
  };
  const toast = notice && (
    <div
      className={`toast ${notice.error ? "error" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      {notice.error ? <CircleAlert size={19} /> : <Check size={19} />}
      <span>{notice.text}</span>
      <button aria-label="Tutup pemberitahuan" onClick={() => setNotice(null)}>
        <X size={17} />
      </button>
    </div>
  );
  if (locked)
    return (
      <div className="access-page">
        <div className="desktop-access-actions">
          <DesktopActions busy={busy} onError={(s) => notify(s, true)} />
        </div>
        <div className="access-panel">
          <div className="brand-mark">
            <img src={defaultIcon} alt="Mitra Ecobike" />
          </div>
          <h1>Toko Offline</h1>
          <p>Masukkan password untuk membuka data toko.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await invoke("unlock_store", { password });
                setPassword("");
                await reload();
              } catch (e) {
                notify(String(e), true);
              }
            }}
          >
            <Field label="Password">
              <input
                autoFocus
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button className="primary full">
              <LockKeyhole size={17} />
              Buka aplikasi
            </button>
          </form>
        </div>
        {toast}
      </div>
    );
  if (fatal)
    return (
      <div className="access-page">
        <div className="desktop-access-actions">
          <DesktopActions busy={busy} onError={(s) => notify(s, true)} />
        </div>
        <div className="access-panel">
          <CircleAlert size={35} />
          <h1>Data belum bisa dibuka</h1>
          <p className="error-detail">{fatal}</p>
          <p>
            Data tidak direset. Coba buka ulang atau pulihkan kumpulan backup
            yang valid.
          </p>
          <div className="actions">
            <button onClick={reload}>Coba lagi</button>
            <button
              className="primary"
              disabled={busy}
              onClick={performRestore}
            >
              Pilih backup untuk pemulihan
            </button>
          </div>
        </div>
        {toast}
      </div>
    );
  if (!db)
    return (
      <div className="access-page">
        <div className="desktop-access-actions">
          <DesktopActions busy={busy} onError={(s) => notify(s, true)} />
        </div>
        <div className="loader" />
        <p>Membuka data toko…</p>
      </div>
    );
  const hasPeriod = ["dashboard", "reports"].includes(page);
  const docKind = Object.keys(labels).includes(page) ? (page as Kind) : null;
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <span className="brand-mark">
            {db.settings[0].logo ? (
              <img
                src={
                  db.settings[0].logo === defaultLogo
                    ? defaultIcon
                    : db.settings[0].logo
                }
                alt="Ikon toko"
              />
            ) : (
              <Store size={24} />
            )}
          </span>
          <strong>{db.settings[0].name}</strong>
        </a>
        <nav>
          {sections.map((s) => (
            <section key={s.title}>
              <p>{s.title}</p>
              {s.items.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  className={page === id ? "selected" : ""}
                  onClick={() => go(id)}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                  {page === id && <ChevronRight size={15} />}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <HardDrive size={17} />
            <span>
              {desktop ? "Data tersimpan di perangkat" : "Pratinjau web"}
            </span>
          </div>
          <small>
            {busy ? "Sedang menyimpan…" : `Tersimpan · revisi ${db.revision}`}
          </small>
          {desktop && (
            <button
              onClick={async () => {
                try {
                  await invoke("lock_store");
                  dbRef.current = null;
                  setDB(null);
                  await reload();
                } catch (e) {
                  notify(String(e), true);
                }
              }}
            >
              <LockKeyhole size={14} />
              Kunci aplikasi
            </button>
          )}
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              onClick={() => setMobile(!mobile)}
              aria-label="Buka menu"
            >
              <Menu size={22} />
            </button>
            <span>Ruang usaha</span>
            <ChevronRight size={14} />
            <strong>{pageTitles[page]}</strong>
          </div>
          <div className="top-status">
            <DesktopActions busy={busy} onError={(s) => notify(s, true)} />
            <button
              type="button"
              className="icon-button theme-toggle"
              aria-label={
                theme === "dark"
                  ? "Aktifkan tema terang"
                  : "Aktifkan tema gelap"
              }
              title={
                theme === "dark"
                  ? "Aktifkan tema terang"
                  : "Aktifkan tema gelap"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <i />
            {busy
              ? "Menyimpan…"
              : desktop
                ? "Offline & tersimpan"
                : "Mode pratinjau"}
            <span className="avatar">{db.settings[0].name[0]}</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{pageTitles[page]}</h1>
              <p>
                {page === "dashboard"
                  ? "Gambaran usaha, dari setiap transaksi."
                  : page === "settings"
                    ? "Atur identitas toko, invoice, dan keamanan data."
                    : page === "reports"
                      ? "Telusuri angka dan unduh laporan toko."
                      : `Kelola ${pageTitles[page].toLowerCase()} dengan catatan yang terhubung.`}
              </p>
            </div>
            {hasPeriod && (
              <div className="period">
                <select
                  aria-label="Periode"
                  value={preset}
                  onChange={(e) => {
                    setPreset(e.target.value);
                    if (e.target.value !== "custom") {
                      const [a, b] = range(e.target.value);
                      setFrom(a);
                      setTo(b);
                    }
                  }}
                >
                  <option value="today">Hari ini</option>
                  <option value="week">7 hari terakhir</option>
                  <option value="month">Bulan ini</option>
                  <option value="year">Tahun ini</option>
                  <option value="all">Semua data</option>
                  <option value="custom">Tanggal khusus</option>
                </select>
                {preset === "custom" && (
                  <>
                    <input
                      aria-label="Dari tanggal"
                      type="date"
                      value={from}
                      max={to}
                      onChange={(e) => setFrom(e.target.value || from)}
                    />
                    <span>—</span>
                    <input
                      aria-label="Sampai tanggal"
                      type="date"
                      min={from}
                      value={to}
                      onChange={(e) => setTo(e.target.value || to)}
                    />
                  </>
                )}
              </div>
            )}
          </div>
          {!desktop && (
            <div className="preview-banner">
              Pratinjau browser: perubahan tersimpan di browser ini. Aplikasi
              desktop membaca dan menulis CSV lokal secara otomatis.
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard db={db} from={from} to={to} onNew={create} onGo={go} />
          )}
          {["items", "customer"].includes(page) && (
            <Masters
              key={page}
              db={db}
              kind={page as "items" | "customer"}
              commit={commit}
              busy={busy}
            />
          )}
          {docKind && (
            <DocumentList
              key={`${page}-${newNonce}`}
              db={db}
              kind={docKind}
              commit={commit}
              busy={busy}
              onView={setDetail}
              onDelete={(d) => ask("delete", d.id, d.number)}
              openNew={newKind === docKind}
              onOpened={() => setNewKind(null)}
            />
          )}
          {page === "payments" && (
            <Payments
              db={db}
              commit={commit}
              busy={busy}
              onCancel={(p: Payment) => ask("payment", p.id, p.number)}
            />
          )}
          {page === "reports" && (
            <Reports
              db={db}
              from={from}
              to={to}
              onError={(s) => notify(s, true)}
            />
          )}
          {page === "settings" && (
            <Settings
              db={db}
              path={path}
              commit={commit}
              busy={busy}
              onRestore={() => ask("restore", "", "Pulihkan backup")}
              onError={(s) => notify(s, true)}
              onNotify={(s) => notify(s)}
            />
          )}
          <footer className="workspace-footer">
            <span>{db.settings[0].name}</span>
            <span>Catatan usaha tersimpan di perangkat kamu.</span>
          </footer>
        </div>
      </main>
      {detail && (
        <Detail
          db={db}
          doc={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditRecord(detail);
            setDetail(null);
          }}
          onCancel={() => ask("doc", detail.id, detail.number)}
          onDelete={() => ask("delete", detail.id, detail.number)}
          onPrint={(mode) => {
            setPrint({ doc: detail, mode });
            setDetail(null);
          }}
        />
      )}
      {editRecord && (
        <Editor
          key={editRecord.id}
          db={db}
          initial={editRecord}
          commit={commit}
          busy={busy}
          onClose={() => setEditRecord(null)}
        />
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.type === "restore"
              ? "Pulihkan backup?"
              : confirmation.type === "delete"
                ? "Hapus dokumen?"
                : "Batalkan pencatatan?"
          }
          onClose={() => setConfirmation(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <div className="confirm-body">
              <p>
                {confirmation.type === "restore"
                  ? "Data aktif akan diganti oleh backup yang kamu pilih. Pada desktop, data aktif dicadangkan terlebih dahulu."
                  : confirmation.type === "delete"
                    ? `${confirmation.name}. Dokumen beserta detailnya akan dihapus. Hapus pembayaran dan dokumen turunan terlebih dahulu jika masih terhubung.`
                    : `${confirmation.name}. Perubahan stok dan saldo akan dihitung ulang sesuai aturan pembatalan.`}
              </p>
              {["doc", "payment"].includes(confirmation.type) && (
                <Field label="Alasan pembatalan">
                  <textarea
                    required
                    minLength={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <footer className="modal-footer">
              <button type="button" onClick={() => setConfirmation(null)}>
                Kembali
              </button>
              <button className="danger" disabled={busy}>
                Lanjutkan
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {print && (
        <Invoice
          db={db}
          key={`${print.doc.id}-${db.revision}`}
          doc={db.documents.find((d) => d.id === print.doc.id) || print.doc}
          mode={print.mode}
          busy={busy}
          onRefreshProfile={() =>
            commit(
              (d) => refreshInvoiceProfile(d, print.doc.id),
              "Logo, garansi, dan rekening invoice diperbarui",
            )
          }
          onClose={() => setPrint(null)}
          onError={(s) => notify(s, true)}
        />
      )}
      {toast}
    </div>
  );
}
export default App;
