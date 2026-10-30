import { csvText, parseCSV } from "./csv";
import { validateDB } from "./domain";
import { type DB } from "./types";
export function snapshotCSV(db: DB) {
  validateDB(db);
  return csvText(
    ["Tabel", "Data JSON"],
    Object.entries(db).map(([key, value]) => [key, JSON.stringify(value)]),
  );
}
export function readSnapshotCSV(text: string): DB {
  const parsed = parseCSV(text);
  if (
    !parsed.headers.includes("tabel") ||
    !parsed.headers.includes("data json")
  )
    throw new Error(
      "Pilih CSV dari tombol Backup ke CSV. CSV operasional digunakan lewat Impor CSV.",
    );
  const result: Record<string, unknown> = {};
  for (const row of parsed.rows) {
    const key = row.cells.tabel;
    if (
      ![
        "schema",
        "revision",
        "items",
        "parties",
        "documents",
        "lines",
        "payments",
        "allocations",
        "audit",
        "settings",
      ].includes(key) ||
      key in result
    )
      throw new Error("Tabel backup tidak valid atau ganda.");
    result[key] = JSON.parse(row.cells["data json"]);
  }
  validateDB(result);
  return result;
}
