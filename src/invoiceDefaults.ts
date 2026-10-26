import type { Settings } from "./types";
import { defaultLogo, defaultPartnerLogo } from "./branding";

// Supplied invoice reference: these are editable defaults, not transaction data.
export const invoiceDefaults = {
  name: "Mitra Ecobike (Nico Wijaya)",
  address:
    "Jawara Express, Jl. Matadireja 1 No.811,\nKec. Purwokerto Timur, Kab. Banyumas, Jawa\n53113",
  phone: "+62 812-2937-991",
  beneficiary: "Nico Vijaya",
  bank: "Bank Central Asia (BCA)",
  bankBranch: "Purwokerto",
  account: "046-1212-432",
  bankCode: "014",
  country: "Indonesia",
  terms: "Cash Before Delivery(CBD)",
  signature: "Mitra EcoBike (Nico Wijaya)",
  warranty: [
    "* Batteries purchased with electric bicycles or motorcycles can be claimed through the respective brand’s dealer.",
    "* Batteries purchased through partners can be shipped directly to Tangerang for inspection to determine warranty eligibility.",
    "Warranty is void if:",
    "1. The battery is exposed to water.",
    "2. The battery is disassembled by the customer or the ME seal is damaged.",
    "3. Damage is caused by improper installation, short circuits, or physical impact.",
    "4. The battery is stored for more than 60 days without charging. Charge it every 3 weeks or at least once a month.",
    "5. Batteries purchased outside official RESMI outlets must be returned to the original store for warranty claims.",
    "Shipping costs are borne by the buyer",
  ].join("\n"),
  logo: defaultLogo,
  partnerLogo: defaultPartnerLogo,
};
export const isMitraIdentity = (name: string) =>
  ["Mitra Ecobike", invoiceDefaults.name, "Toko Offline"].some(
    (value) => value.toLowerCase() === name.trim().toLowerCase(),
  );

export function invoiceProfile(s: Settings) {
  return {
    issuerName: s.invoiceIssuer || s.name,
    issuerAddress: s.address,
    issuerPhone: s.phone,
    bank: s.bank,
    beneficiary: s.beneficiary,
    account: s.account,
    bankBranch: s.bankBranch,
    bankCode: s.bankCode,
    country: s.country,
    warranty: s.warranty,
    terms: s.terms,
    signature: s.signature,
    logo: s.logo,
    partnerLogo: s.partnerLogo,
    invoiceDefaultsVersion: 1,
  };
}
