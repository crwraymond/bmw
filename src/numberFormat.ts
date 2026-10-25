export function editingNumber(
  raw: string,
  decimals = 0,
  negative = false,
): string | null {
  const text = raw.replace(/[.\s\u00a0]/g, "");
  if (!/^-?\d*(,\d*)?$/.test(text) || (!negative && text.startsWith("-")))
    return null;
  const sign = text.startsWith("-") ? "-" : "";
  const unsigned = text.replace(/^-/, "");
  const [whole, fraction] = unsigned.split(",");
  if (fraction !== undefined && (decimals === 0 || fraction.length > decimals))
    return null;
  const digits = whole.replace(/^0+(?=\d)/, "");
  return (
    sign +
    digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") +
    (fraction !== undefined ? "," + fraction : "")
  );
}
export function numberValue(text: string): number {
  return Number(text.replaceAll(".", "").replace(",", ".")) || 0;
}
export function displayNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(value);
}
