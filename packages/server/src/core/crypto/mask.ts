export function maskSecret(value: string): string {
  if (value.length <= 10) return "•".repeat(value.length);
  const head = value.slice(0, 6);
  const tail = value.slice(-4);
  return `${head}${"•".repeat(6)}${tail}`;
}
