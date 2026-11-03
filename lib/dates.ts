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

/** yyyy-mm-dd naming a real calendar day; Date.parse alone accepts 2026-02-30. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
