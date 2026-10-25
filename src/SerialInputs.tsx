import { useEffect, useRef, useState } from "react";
import { serialValues } from "./serials";

const pageSize = 12;
export function SerialInputs({
  value,
  quantity,
  name,
  onChange,
}: {
  value: string;
  quantity: number;
  name: string;
  onChange: (value: string) => void;
}) {
  const [page, setPage] = useState(0);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const jump = useRef<number | null>(null);
  const values = serialValues(value);
  const count = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;
  const extras =
    count > 0 ? values.slice(count).filter((serial) => serial.trim()) : [];
  useEffect(() => {
    if (jump.current !== null) {
      inputs.current.get(jump.current)?.focus();
      jump.current = null;
    }
  }, [current]);
  const update = (index: number, next: string) => {
    const updated = [...values];
    while (updated.length <= index) updated.push("");
    updated[index] = next.replace(/[,\r\n]/g, " ");
    onChange(updated.join("\n").replace(/\n+$/, ""));
  };
  return (
    <div className="serial-inputs">
      {count > 0 ? (
        <>
          {Array.from(
            { length: Math.min(pageSize, count - start) },
            (_, offset) => {
              const index = start + offset;
              return (
                <label className="serial-unit" key={index}>
                  <span>SN {index + 1}</span>
                  <input
                    ref={(input) => {
                      if (input) inputs.current.set(index, input);
                      else inputs.current.delete(index);
                    }}
                    aria-label={`SN ${name} unit ${index + 1}`}
                    placeholder={`Serial number ${index + 1}`}
                    value={values[index] || ""}
                    onChange={(e) => update(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (index + 1 >= count) return;
                      const next = inputs.current.get(index + 1);
                      if (next) next.focus();
                      else {
                        jump.current = index + 1;
                        setPage(Math.floor((index + 1) / pageSize));
                      }
                    }}
                  />
                </label>
              );
            },
          )}
          {pages > 1 && (
            <div className="serial-pages">
              <button
                type="button"
                disabled={!current}
                aria-label={`SN sebelumnya ${name}`}
                onClick={() => setPage(current - 1)}
              >
                ‹
              </button>
              <span>
                {start + 1}–{Math.min(start + pageSize, count)} dari {count}
              </span>
              <button
                type="button"
                disabled={current === pages - 1}
                aria-label={`SN berikutnya ${name}`}
                onClick={() => setPage(current + 1)}
              >
                ›
              </button>
            </div>
          )}
          {extras.length > 0 && (
            <details className="serial-extras">
              <summary>{extras.length} SN di luar Qty saat ini</summary>
              <p>{extras.join(", ")}</p>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    values.slice(0, count).join("\n").replace(/\n+$/, ""),
                  )
                }
              >
                Hapus SN di luar Qty
              </button>
            </details>
          )}
        </>
      ) : (
        <>
          <textarea
            aria-label={`SN ${name}`}
            value={value}
            placeholder="Serial number (opsional)"
            onChange={(e) => onChange(e.target.value)}
          />
          <small>
            {quantity > 0
              ? "Untuk Qty pecahan, isi SN yang relevan, satu per baris."
              : "Isi Qty untuk menambahkan kotak SN per unit."}
          </small>
        </>
      )}
    </div>
  );
}
