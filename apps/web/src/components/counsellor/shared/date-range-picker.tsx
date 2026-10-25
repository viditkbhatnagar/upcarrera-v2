import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useIsMobile } from "@/hooks/use-mobile";
import { type DateRange, rangeLabel } from "@/lib/date-range";
import { cn } from "@/lib/utils";

export function DateRangePicker({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: DateRange;
  onChange: (r: DateRange) => void;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal md:w-auto md:min-w-[170px]",
            !value.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}: {rangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={isMobile ? 1 : 2}
          selected={value.from ? { from: value.from, to: value.to } : undefined}
          onSelect={(r) => onChange(r ? { from: r.from, to: r.to } : {})}
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground">Pick one day, or a from–to range</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onChange({})}>Clear</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
