const BA_TIMEZONE = 'America/Argentina/Buenos_Aires';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function getDatePartsInTimeZone(date: Date = new Date()): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function parseDateInput(dateInput: string): DateParts {
  const [year, month, day] = dateInput.split('-').map(Number);
  return { year, month, day };
}

function toUtcDayNumber({ year, month, day }: DateParts): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function getCurrentBADateInputValue(now: Date = new Date()): string {
  const { year, month, day } = getDatePartsInTimeZone(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getLastDayOfCurrentMonthBA(now: Date = new Date()): string {
  const { year, month } = getDatePartsInTimeZone(now);
  const lastDay = new Date(Date.UTC(year, month, 0));
  return `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`;
}

export function getDaysRemainingInclusiveBA(dateInput: string, now: Date = new Date()): number {
  const today = getDatePartsInTimeZone(now);
  const target = parseDateInput(dateInput);
  return Math.max(1, toUtcDayNumber(target) - toUtcDayNumber(today) + 1);
}

export function isDateAtOrAfterTodayBA(dateInput: string, now: Date = new Date()): boolean {
  const today = getDatePartsInTimeZone(now);
  const target = parseDateInput(dateInput);
  return toUtcDayNumber(target) >= toUtcDayNumber(today);
}
