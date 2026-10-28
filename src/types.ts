import { invoiceDefaults } from "./invoiceDefaults";
export type Kind =
  | "sale"
  | "purchase"
  | "customer_order"
  | "supplier_order"
  | "sale_return"
  | "purchase_return";
export type Status = "draft" | "final" | "cancelled";
export interface Item {
  id: string;
  code: string;
  name: string;
  unit: string;
  pack: string;
  buyPrice: number;
  sellPrice: number;
  openingQty: number;
  openingCost: number;
  minStock: number;
  active: boolean;
}
export interface Party {
  deleted?: boolean;
  id: string;
  kind: "customer" | "supplier";
  code: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  fax: string;
  openingBalance: number;
  active: boolean;
}
export interface Settings {
  id: string;
  invoiceIssuer?: string;
  name: string;
  address: string;
  phone: string;
  bank: string;
  beneficiary: string;
  account: string;
  bankBranch: string;
  bankCode: string;
  country: string;
  warranty: string;
  terms: string;
  signature: string;
  logo: string;
  partnerLogo: string;
  brandingVersion?: number;
  invoiceDefaultsVersion?: number;
  invoiceTextDefaultsVersion?: number;
}
export interface Doc {
  serialTracking?: string;
  id: string;
  kind: Kind;
  status: Status;
  number: string;
  date: string;
  seq: number;
  partyId: string;
  partyName: string;
  partyAddress: string;
  partyPhone: string;
  orderId: string;
  refId: string;
  discount: number;
  downPayment: number;
  total: number;
  notes: string;
  terms: string;
  issuerName: string;
  issuerAddress: string;
  issuerPhone: string;
  bank: string;
  beneficiary: string;
  account: string;
  bankBranch: string;
  bankCode: string;
  country: string;
  warranty: string;
  signature: string;
  logo: string;
  partnerLogo: string;
  createdAt: string;
  cancelReason: string;
  invoiceDefaultsVersion?: number;
}
export interface Line {
  id: string;
  docId: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  discountType?: "amount" | "percent";
  discountValue?: number;
  total: number;
  cost: number;
  refLineId: string;
  serials: string;
}
export interface Payment {
  id: string;
  number: string;
  date: string;
  partyId: string;
  amount: number;
  direction: "in" | "out";
  notes: string;
  status: "final" | "cancelled";
  sourceDocId?: string;
}
export interface Allocation {
  id: string;
  paymentId: string;
  docId: string;
  amount: number;
}
export interface Audit {
  id: string;
  time: string;
  action: string;
  entity: string;
  detail: string;
}
export interface DB {
  schema: number;
  revision: number;
  items: Item[];
  parties: Party[];
  documents: Doc[];
  lines: Line[];
  payments: Payment[];
  allocations: Allocation[];
  audit: Audit[];
  settings: Settings[];
}
export const labels: Record<Kind, string> = {
  sale: "Penjualan",
  purchase: "Pembelian",
  customer_order: "Order customer",
  supplier_order: "Order pembelian",
  sale_return: "Retur penjualan",
  purchase_return: "Retur pembelian",
};
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const qty = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
export const dateLabel = (s: string) =>
  s
    ? new Date(`${s}T12:00:00`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export function emptyDB(): DB {
  return {
    schema: 1,
    revision: 0,
    items: [],
    parties: [],
    documents: [],
    lines: [],
    payments: [],
    allocations: [],
    audit: [],
    settings: [
      {
        id: "store",
        ...invoiceDefaults,
        name: "Mitra Ecobike",
        invoiceIssuer: invoiceDefaults.name,
        brandingVersion: 1,
        invoiceDefaultsVersion: 1,
        invoiceTextDefaultsVersion: 1,
      },
    ],
  };
}

// Natural code order keeps mixed letter/number codes consistent across views.
export const compareCodes = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, "id", { numeric: true, sensitivity: "base" });
