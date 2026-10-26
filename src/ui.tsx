import {
  useEffect,
  useRef,
  useId,
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { X, Inbox, Search, Download } from "lucide-react";
import type { DB } from "./types";
export type Commit = (
  change: (db: DB) => void,
  message?: string,
) => Promise<boolean>;
export function Field({
  label,
  children,
  hint,
  action,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      {action ? (
        <div className="field-heading">
          <label id={id}>{label}</label>
          {action}
        </div>
      ) : (
        <label id={id}>{label}</label>
      )}
      {Children.map(children, (child) =>
        isValidElement(child) &&
        (["input", "select", "textarea"].includes(String(child.type)) ||
          typeof child.type === "function")
          ? cloneElement(child as ReactElement<Record<string, unknown>>, {
              "aria-labelledby": id,
              "aria-describedby": hint ? `${id}-hint` : undefined,
            })
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({
  title = "Belum ada data",
  detail = "Data yang ditambahkan akan tampil di sini.",
  action,
}: {
  title?: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Tutup dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Toolbar({
  search,
  setSearch,
  children,
  onExport,
}: {
  search: string;
  setSearch: (s: string) => void;
  children?: ReactNode;
  onExport?: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="search">
        <Search size={17} />
        <input
          aria-label="Cari data"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode, nama, atau nomor…"
        />
      </div>
      <div className="actions">
        {onExport && (
          <button onClick={onExport}>
            <Download size={16} />
            Ekspor CSV
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const names: Record<string, string> = {
    draft: "Draf",
    final: "Final",
    cancelled: "Dibatalkan",
    active: "Aktif",
    inactive: "Nonaktif",
  };
  return <span className={`badge ${value}`}>{names[value] || value}</span>;
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DeleteConfirm({
  name,
  busy,
  onClose,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Modal title="Hapus data?" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onConfirm();
        }}
      >
        <div className="confirm-body">
          <p>
            Hapus {name}? Tindakan ini menghapus data beserta detailnya. Data
            yang masih terhubung dengan transaksi lain harus diselesaikan atau
            dihapus lebih dahulu.
          </p>
        </div>
        <footer className="modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Batal
          </button>
          <button className="danger" disabled={busy}>
            Hapus data
          </button>
        </footer>
      </form>
    </Modal>
  );
}
