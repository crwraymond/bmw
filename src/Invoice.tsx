import { invoiceProfile } from "./invoiceDefaults";
import { useLayoutEffect, useRef, useState } from "react";
import { Printer, X, RefreshCw } from "lucide-react";
import { type DB, type Doc, type Line, money, qty } from "./types";
import { displayNumber } from "./numberFormat";
import { linesOf, lineDiscount, lineNet, paid, returnedValue } from "./domain";
import { downPaymentFor } from "./revisions";
import { printDocument } from "./storage";
import { serialText } from "./serials";
function InvoiceMoney({ value }: { value: number }) {
  return (
    <div className="invoice-money">
      <span>Rp</span>
      <span>{displayNumber(value)}</span>
    </div>
  );
}
type Sheet = {
  lines: Line[];
  warranty: string;
  summary: boolean;
  final: boolean;
};
type ProfileSource = "settings" | "saved";
type InvoiceProps = {
  db: DB;
  doc: Doc;
  mode: "normal" | "copy" | "both";
  onClose: () => void;
  onError: (s: string) => void;
  busy?: boolean;
  onRefreshProfile?: () => Promise<boolean>;
};
export function Invoice(props: InvoiceProps) {
  const [source, setSource] = useState<ProfileSource>("settings");
  const doc =
    source === "settings"
      ? { ...props.doc, ...invoiceProfile(props.db.settings[0]) }
      : props.doc;
  return (
    <InvoicePages
      key={source}
      {...props}
      doc={doc}
      source={source}
      onSourceChange={setSource}
    />
  );
}
function InvoicePages({
  db,
  doc,
  mode,
  onClose,
  onError,
  busy = false,
  onRefreshProfile,
  source,
  onSourceChange,
}: InvoiceProps & {
  source: ProfileSource;
  onSourceChange: (source: ProfileSource) => void;
}) {
  const [sheets, setSheets] = useState<Sheet[]>([
    {
      lines: linesOf(db, doc.id),
      warranty: doc.warranty,
      summary: true,
      final: true,
    },
  ]);
  const [overflow, setOverflow] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const variants = mode === "both" ? [false, true] : [mode === "copy"];
  const totalPaid = paid(db, doc.id);
  const downPayment = downPaymentFor(db, doc)?.amount || 0;
  const otherPayments = totalPaid - downPayment;
  const returns = returnedValue(db, doc.id);
  const remaining = doc.total - returns - totalPaid;
  const hasDeductions = totalPaid > 0 || returns > 0;
  useLayoutEffect(() => {
    const index = sheets.findIndex(
      (_, i) => (refs.current[i]?.getBoundingClientRect().height || 0) > 1015,
    );
    if (index < 0) {
      setOverflow(false);
      return;
    }
    const page = sheets[index];
    let split: Sheet[] | null = null;
    if (page.lines.length > 1) {
      const half = Math.ceil(page.lines.length / 2);
      split = [
        {
          lines: page.lines.slice(0, half),
          warranty: "",
          summary: false,
          final: false,
        },
        { ...page, lines: page.lines.slice(half) },
      ];
    } else if (page.lines.length && page.warranty) {
      split = [
        { ...page, warranty: "", final: false },
        {
          lines: [],
          warranty: page.warranty,
          summary: false,
          final: page.final,
        },
      ];
    } else if (page.warranty.length > 200) {
      let half = Math.floor(page.warranty.length / 2);
      const space = page.warranty.lastIndexOf(" ", half);
      if (space > half / 2) half = space;
      split = [
        { ...page, warranty: page.warranty.slice(0, half), final: false },
        {
          lines: [],
          warranty: page.warranty.slice(half).trim(),
          summary: false,
          final: page.final,
        },
      ];
    }
    if (split)
      setSheets([
        ...sheets.slice(0, index),
        ...split,
        ...sheets.slice(index + 1),
      ]);
    else setOverflow(true);
  }, [sheets]);
  return (
    <div className="print-overlay">
      <div className="print-toolbar">
        <div>
          <strong>Pratinjau invoice</strong>
          <small>
            {overflow
              ? "Ada baris terlalu panjang. Ringkas deskripsi/serial sebelum mencetak."
              : `A4 portrait · ${sheets.length * variants.length} halaman · Simpan PDF tersedia di dialog cetak sistem`}
          </small>
        </div>
        <div className="actions">
          <label className="invoice-source">
            Data penerbit
            <select
              aria-label="Sumber data penerbit invoice"
              value={source}
              onChange={(e) => onSourceChange(e.target.value as ProfileSource)}
            >
              <option value="settings">Pengaturan tersimpan</option>
              <option value="saved">Profil saat transaksi</option>
            </select>
          </label>
          {onRefreshProfile && source === "settings" && (
            <button
              disabled={busy}
              onClick={onRefreshProfile}
              title="Perbarui logo, penerbit, garansi, rekening, dan syarat invoice ini dari Pengaturan"
            >
              <RefreshCw size={16} />
              Simpan profil ke dokumen
            </button>
          )}
          <button onClick={onClose}>
            <X size={16} />
            Tutup
          </button>
          <button
            className="primary"
            disabled={overflow || busy}
            onClick={async () => {
              try {
                await printDocument();
              } catch (e) {
                onError(String(e));
              }
            }}
          >
            <Printer size={16} />
            Cetak / Simpan PDF
          </button>
        </div>
      </div>
      <div className="print-pages">
        {variants.flatMap((copy, v) =>
          sheets.map((sheet, i) => (
            <article
              key={`${v}-${i}`}
              ref={(el) => {
                if (v === 0) refs.current[i] = el;
              }}
              className="invoice"
              data-copy={copy ? "true" : "false"}
            >
              <header className="invoice-brand">
                <div>
                  {doc.logo ? (
                    <img src={doc.logo} alt="Logo penerbit" />
                  ) : (
                    <strong>{doc.issuerName}</strong>
                  )}
                </div>
                <div className="invoice-brand-space" />
              </header>
              <div className="invoice-title">
                <h1>{copy ? "Copy Invoice" : "Invoice"}</h1>
                <div className="invoice-partner-logo">
                  {doc.partnerLogo && (
                    <img src={doc.partnerLogo} alt="Logo mitra" />
                  )}
                </div>
              </div>
              <div className="invoice-meta">
                <section>
                  <p>
                    <b>Date:</b>{" "}
                    {new Date(`${doc.date}T12:00:00`).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "long", year: "numeric" },
                    )}
                  </p>
                  <p>
                    <b>Reff:</b> {doc.number}
                  </p>
                </section>
                <section>
                  <b>Issuer:</b>
                  <strong>{doc.issuerName}</strong>
                  <p>{doc.issuerAddress}</p>
                  <p>
                    {doc.issuerPhone &&
                      `Telepon: ${doc.issuerPhone.replace(/^(?:T|Telp\.?|Telepon|Phone|Telephone)\s*:\s*/i, "")}`}
                  </p>
                </section>
              </div>
              <section className="invoice-account">
                <b>For Account :</b>
                <strong>{doc.partyName}</strong>
                <p>Address: {doc.partyAddress || "—"}</p>
                <p>Contact Person: {doc.partyPhone || "—"}</p>
              </section>
              {sheet.lines.length > 0 && (
                <table className="invoice-table">
                  <colgroup>
                    {[5.1, 17.4, 30.3, 6, 18, 23.2].map((width, index) => (
                      <col key={index} style={{ width: `${width}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>SN</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit Price IDR</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {linesOf(db, doc.id).findIndex((x) => x.id === l.id) +
                            1}
                        </td>
                        <td className="serial-cell">{serialText(l.serials)}</td>
                        <td>
                          {l.name}
                          {lineDiscount(l) > 0 && (
                            <small className="invoice-product-discount">
                              Diskon{" "}
                              {l.discountType === "percent"
                                ? `${qty(l.discountValue ?? 0)}%`
                                : `${money(l.discountValue ?? 0)}/unit`}{" "}
                              (−{money(lineDiscount(l))})
                            </small>
                          )}
                        </td>
                        <td>{qty(l.qty)}</td>
                        <td>
                          <InvoiceMoney value={l.price} />
                        </td>
                        <td className="invoice-line-total">
                          <InvoiceMoney value={lineNet(l)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {sheet.summary && (
                    <tfoot>
                      {doc.discount > 0 && (
                        <tr>
                          <td colSpan={5}>Discount</td>
                          <td>
                            <InvoiceMoney value={-doc.discount} />
                          </td>
                        </tr>
                      )}
                      {hasDeductions && (
                        <tr>
                          <td colSpan={5}>Total Invoice</td>
                          <td>
                            <InvoiceMoney value={doc.total} />
                          </td>
                        </tr>
                      )}
                      {downPayment > 0 && (
                        <tr>
                          <td colSpan={5}>Down Payment (DP)</td>
                          <td>
                            <InvoiceMoney value={-downPayment} />
                          </td>
                        </tr>
                      )}
                      {otherPayments > 0 && (
                        <tr>
                          <td colSpan={5}>Pembayaran lainnya</td>
                          <td>
                            <InvoiceMoney value={-otherPayments} />
                          </td>
                        </tr>
                      )}
                      {returns > 0 && (
                        <tr>
                          <td colSpan={5}>Retur</td>
                          <td>
                            <InvoiceMoney value={-returns} />
                          </td>
                        </tr>
                      )}
                      {remaining < 0 && (
                        <tr>
                          <td colSpan={5}>Saldo kredit</td>
                          <td>
                            <InvoiceMoney value={-remaining} />
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={5}>
                          <b>
                            Grand Total
                            {hasDeductions && " (Sisa pembayaran)"}
                          </b>
                        </td>
                        <td>
                          <b>
                            <InvoiceMoney value={Math.max(0, remaining)} />
                          </b>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
              {sheet.summary && (
                <section className="invoice-terms">
                  <b>Terms of Payment:</b> {doc.terms || "—"}
                  <div className="invoice-payment-status">
                    Status pembayaran:{" "}
                    <b>{remaining > 0 ? "Belum lunas" : "Lunas"}</b>
                    {remaining < 0 && " · Memiliki saldo kredit"}
                  </div>
                </section>
              )}
              {sheet.warranty && (
                <section className="invoice-warranty">
                  {sheet.warranty && (
                    <b>
                      WARRANTY TERMS & CONDITIONS
                      {!sheet.lines.length ? " (lanjutan)" : ""}
                    </b>
                  )}
                  <div className="warranty-text">
                    {sheet.warranty.split("\n").map((line, index) => (
                      <div
                        key={index}
                        className={
                          /^Warranty is void if/i.test(line)
                            ? "warranty-void"
                            : undefined
                        }
                      >
                        {/^(Warranty is void if|Shipping costs|Syarat|Catatan)/i.test(
                          line,
                        ) ? (
                          <b>{line}</b>
                        ) : (
                          line || <br />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <div
                className={`invoice-footer ${sheet.final ? "" : "continuation"}`}
              >
                {sheet.final ? (
                  <>
                    <section className="invoice-bank">
                      {[
                        ["Beneficiary", doc.beneficiary],
                        ["Bank Name", doc.bank],
                        ["Branch", doc.bankBranch],
                        ["Account Number", doc.account],
                        ["Bank Code", doc.bankCode],
                        ["Country", doc.country],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, val]) => (
                          <p key={k}>
                            {k}: <b>{val}</b>
                          </p>
                        ))}
                    </section>
                    <section className="invoice-signature">
                      <p>Signature: {doc.signature || doc.issuerName}</p>
                    </section>
                  </>
                ) : (
                  <p className="continued">
                    Dilanjutkan pada halaman berikutnya.
                  </p>
                )}
                {copy && (
                  <div className="copy-stamp" aria-label="COPY">
                    COPY
                  </div>
                )}
              </div>
              {sheets.length > 1 && (
                <div className="invoice-footnote">
                  {doc.number}
                  {copy ? " • COPY" : ""} · Halaman {i + 1} / {sheets.length}
                </div>
              )}
            </article>
          )),
        )}
      </div>
    </div>
  );
}
