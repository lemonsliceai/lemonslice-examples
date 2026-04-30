/** Dummy availability for the demo calendar. */

export type DaySlot = {
  date: Date;
  labelDay: string;
  labelNum: string;
  iso: string;
};

export type TimeOption = { label: string; id: string };

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function nextWeekFrom(today = new Date()): DaySlot[] {
  const days: DaySlot[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.toLocaleDateString("en-US", { weekday: "short" });
    const num = `${d.getDate()}`;
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    days.push({
      date: d,
      labelDay: dow,
      labelNum: num,
      iso,
    });
  }
  return days;
}

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse YYYY-MM-DD in local calendar (no UTC shift). */
export function parseLocalDayIso(iso: string): Date | null {
  const m = iso.trim().match(ISO_DAY_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(y, mo - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return d;
}

/**
 * Seven-day strip starting from `anchorDay`, unless `selectedIso` is a valid day outside that strip —
 * then the strip starts on that day so voice/UI selections always match a visible pill.
 */
export function weekSlotsAroundSelection(selectedIso: string | null | undefined, anchorDay: Date): DaySlot[] {
  const base = nextWeekFrom(anchorDay);
  if (!selectedIso) return base;
  const trimmed = selectedIso.trim();
  if (!ISO_DAY_RE.test(trimmed)) return base;
  if (base.some((d) => d.iso === trimmed)) return base;
  const parsed = parseLocalDayIso(trimmed);
  if (!parsed) return base;
  return nextWeekFrom(parsed);
}

/** Same slots for every day in this demo */
export const SLOT_OPTIONS: TimeOption[] = [
  { id: "1", label: "1:00 pm" },
  { id: "2", label: "1:30 pm" },
  { id: "3", label: "2:00 pm" },
  { id: "4", label: "3:00 pm" },
  { id: "5", label: "3:30 pm" },
  { id: "6", label: "4:00 pm" },
];
