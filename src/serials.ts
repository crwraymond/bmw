export function serialValues(value: string): string[] {
  return value ? value.split(/\r?\n|,/) : [];
}
export const serialText = (value: string) =>
  serialValues(value)
    .map((serial) => serial.trim())
    .filter(Boolean)
    .join("\n");
