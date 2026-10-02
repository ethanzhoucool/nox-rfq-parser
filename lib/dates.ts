const NOX_TIME_ZONE = "America/Detroit";

/** Today's date (yyyy-mm-dd) in Detroit, where Nox's shop runs. */
export function todayIso(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: NOX_TIME_ZONE });
}

export function addBusinessDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
