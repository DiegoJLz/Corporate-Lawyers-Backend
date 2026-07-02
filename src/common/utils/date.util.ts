export function isExpired(date: Date): boolean {
  return new Date(date).getTime() < Date.now();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatDate(date: Date): string {
  return date.toISOString();
}
