import { format } from "date-fns";

export type DateRange = { from?: Date; to?: Date };

export const dayRange = (r: DateRange) => {
  if (!r.from) return null;
  const from = new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate());
  const to = r.to
    ? new Date(r.to.getFullYear(), r.to.getMonth(), r.to.getDate(), 23, 59, 59)
    : new Date(from.getTime() + 86399999);
  return { from, to };
};

export const inRange = (iso: string, r: { from: Date; to: Date }) => {
  const d = new Date(`${iso}T12:00:00`);
  return d >= r.from && d <= r.to;
};

export const rangeLabel = (r: DateRange) =>
  !r.from
    ? "All dates"
    : r.to && r.to.getTime() !== r.from.getTime()
      ? `${format(r.from, "d MMM yyyy")} – ${format(r.to, "d MMM yyyy")}`
      : format(r.from, "d MMM yyyy");
