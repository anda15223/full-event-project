export function isValidEmail(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(trimmed);
}
