export function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}
