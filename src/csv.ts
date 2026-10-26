export type CSVRow = { line: number; cells: Record<string, string> };
export const headerKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");
export function csvText(headers: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    let s = String(v);
    if (typeof v === "string" && /^[=+@'\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")
  );
}
export function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  if (text.length > 20_000_000) throw new Error("File maksimal 20 MB.");
  text = text.replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD") || text.includes("\0"))
    throw new Error("Simpan CSV dengan encoding UTF-8.");
  let quoted = false;
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === "\r" || c === "\n") break;
      if (c in counts) counts[c]++;
    }
  }
  const delimiter = Object.keys(counts).sort(
    (a, b) => counts[b] - counts[a],
  )[0];
  const records: { line: number; values: string[] }[] = [];
  let values: string[] = [],
    value = "",
    state: "plain" | "quoted" | "closed" = "plain",
    line = 1,
    start = 1;
  const finishCell = () => {
    values.push(value.replace(/^'(?=[=+@'\-\t\r])/, ""));
    value = "";
    state = "plain";
  };
  const finishRow = () => {
    finishCell();
    if (values.some((v) => v.trim())) records.push({ line: start, values });
    values = [];
    start = line + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === "quoted") {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else state = "closed";
      } else {
        value += c;
        if (c === "\n") line++;
      }
    } else if (c === delimiter) finishCell();
    else if (c === "\r" || c === "\n") {
      finishRow();
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
    } else if (c === '"' && state === "plain" && !value) state = "quoted";
    else {
      if (state === "closed" || c === '"')
        throw new Error(`Baris ${line}: tanda kutip CSV tidak valid.`);
      value += c;
    }
  }
  if (state === "quoted")
    throw new Error(`Baris ${start}: tanda kutip belum ditutup.`);
  finishRow();
  const first = records.shift();
  if (!first) throw new Error("File CSV kosong.");
  const headers = first.values.map(headerKey);
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("Nama kolom kosong atau ganda.");
  if (records.length > 10000)
    throw new Error("Maksimal 10.000 baris per file.");
  const rows = records.map((r) => {
    if (r.values.length !== headers.length)
      throw new Error(`Baris ${r.line}: jumlah kolom berbeda dari header.`);
    return {
      line: r.line,
      cells: Object.fromEntries(headers.map((h, i) => [h, r.values[i]])),
    };
  });
  return { headers, rows };
}
export function csvNumber(value: string, name: string, signed = false) {
  let s = value.trim().replace(/^Rp\s*/i, "");
  if (!s) return 0;
  // Format Indonesia: titik ribuan, koma desimal. Dot decimals accepted when unambiguous.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))
    s = s.replaceAll(".", "").replace(",", ".");
  else if (/^-?\d+(,\d+)?$/.test(s)) s = s.replace(",", ".");
  else if (!/^-?\d+\.\d+$/.test(s))
    throw new Error(`${name}: angka tidak valid (${value}).`);
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12 || (!signed && n < 0))
    throw new Error(`${name}: angka di luar batas.`);
  return n;
}
