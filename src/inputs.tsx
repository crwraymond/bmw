import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { displayNumber, editingNumber, numberValue } from "./numberFormat";
type NumberProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max" | "step"
> & {
  value: number;
  onValueChange: (value: number) => void;
  decimals?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
};
export function NumberInput({
  value,
  onValueChange,
  decimals = 0,
  min,
  max,
  required,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: NumberProps) {
  const [text, setText] = useState(displayNumber(value, decimals));
  const ref = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const caret = useRef<number | null>(null);
  const negative = min === undefined || Number(min) < 0;
  useEffect(() => {
    setText((current) =>
      focused.current && numberValue(current) === value
        ? current
        : displayNumber(value, decimals),
    );
  }, [value, decimals]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const normalized = editingNumber(text, decimals, negative);
    const numeric = numberValue(text);
    let error = "";
    if (normalized === null)
      error = "Masukkan angka dengan format Indonesia yang valid.";
    else if (["-", ",", "-,"].includes(text))
      error = "Lengkapi angka terlebih dahulu.";
    else if (required && !text) error = "Isi angka terlebih dahulu.";
    else if (min !== undefined && numeric < Number(min))
      error = `Nilai minimal ${displayNumber(Number(min), decimals)}.`;
    else if (max !== undefined && numeric > Number(max))
      error = `Nilai maksimal ${displayNumber(Number(max), decimals)}.`;
    el.setCustomValidity(error);
    if (focused.current && caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text, min, max, decimals, negative, required]);
  const change = (raw: string, position: number | null) => {
    const formatted = editingNumber(raw, decimals, negative);
    if (formatted === null) {
      setText(raw);
      return;
    }
    const logical = raw
      .slice(0, position ?? raw.length)
      .replaceAll(".", "").length;
    let count = 0,
      index = 0;
    for (; index < formatted.length && count < logical; index++)
      if (formatted[index] !== ".") count++;
    caret.current = index;
    setText(formatted);
    onValueChange(numberValue(formatted));
  };
  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      required={required}
      value={text}
      onChange={(e) => change(e.target.value, e.target.selectionStart)}
      onFocus={(e) => {
        focused.current = true;
        if (value === 0) e.currentTarget.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (editingNumber(text, decimals, negative) !== null)
          setText(displayNumber(numberValue(text), decimals));
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "." && decimals) {
          e.preventDefault();
          const el = e.currentTarget;
          const start = el.selectionStart ?? text.length,
            end = el.selectionEnd ?? start;
          if (!text.includes(","))
            change(text.slice(0, start) + "," + text.slice(end), start + 1);
        }
        onKeyDown?.(e);
      }}
    />
  );
}
export interface Choice {
  value: string;
  label: string;
  search?: string;
  detail?: string;
}
type SearchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onSelect"
> & {
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  emptyLabel?: string;
};
export function SearchSelect({
  value,
  onChange,
  options,
  disabled,
  required,
  placeholder = "Cari kode atau nama…",
  emptyLabel = "Tidak ada pilihan yang cocok.",
  ...props
}: SearchProps) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(
    options.find((o) => o.value === value)?.label || "",
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const editing = useRef(false);
  const previous = useRef(value);
  const selected = options.find((o) => o.value === value);
  const term =
    query === selected?.label ? "" : query.trim().toLocaleLowerCase("id");
  const matches = options.filter((o) =>
    `${o.label} ${o.search || ""}`.toLocaleLowerCase("id").includes(term),
  );
  useEffect(() => {
    if (value !== previous.current) {
      if (!(editing.current && !value))
        setQuery(options.find((o) => o.value === value)?.label || "");
      previous.current = value;
    }
  }, [value, options]);
  useEffect(() => {
    input.current?.setCustomValidity(
      required && !value ? "Pilih salah satu hasil pencarian." : "",
    );
  }, [required, value]);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  const choose = (option: Choice) => {
    editing.current = false;
    setQuery(option.label);
    setOpen(false);
    setActive(-1);
    onChange(option.value);
  };
  return (
    <div className={`search-select ${disabled ? "is-disabled" : ""}`}>
      <input
        {...props}
        ref={input}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && !disabled}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        value={query}
        onFocus={(e) => {
          editing.current = true;
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          editing.current = true;
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
          if (value) onChange("");
        }}
        onBlur={() => {
          editing.current = false;
          setOpen(false);
          setQuery(options.find((o) => o.value === value)?.label || "");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              e.key === "ArrowDown"
                ? Math.min(i + 1, matches.length - 1)
                : Math.max(0, i - 1),
            );
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            e.stopPropagation();
            const option = matches[active < 0 ? 0 : active];
            if (option) choose(option);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setQuery(selected?.label || "");
          }
        }}
      />
      <button
        type="button"
        className="select-toggle"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Tampilkan pilihan"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const next = !open;
          input.current?.focus();
          setOpen(next);
        }}
      >
        <ChevronDown size={17} />
      </button>
      {open && !disabled && (
        <div role="listbox" id={`${id}-list`} className="select-options">
          {matches.length ? (
            matches.map((o, i) => (
              <button
                type="button"
                role="option"
                id={`${id}-${i}`}
                aria-selected={o.value === value}
                key={o.value}
                className={i === active ? "highlighted" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <span>
                  {o.label}
                  {o.detail && <small>{o.detail}</small>}
                </span>
                {o.value === value && <Check size={15} />}
              </button>
            ))
          ) : (
            <div className="select-no-results">
              <Search size={16} />
              {emptyLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
