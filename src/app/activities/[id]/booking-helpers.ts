import type { PublicSlotWithCapacity } from "@/lib/slots/types";

export type SlotGroup = {
  key: string;
  label: string;
  slots: PublicSlotWithCapacity[];
  departureCount: number;
  availableCount: number;
  soldOut: boolean;
};

export type AvailabilitySummary = {
  tone: "available" | "low" | "sold-out";
  badge: string;
  detail: string;
};

const LOW_INVENTORY_THRESHOLD = 3;

const dateGroupFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function getRemainingCapacity(slot: PublicSlotWithCapacity) {
  if (typeof slot.remaining_capacity === "number" && Number.isFinite(slot.remaining_capacity)) {
    return Math.max(0, Math.trunc(slot.remaining_capacity));
  }

  return Math.max(
    0,
    slot.max_capacity - slot.off_platform_participants - slot.booked_participants,
  );
}

export function isSlotSoldOut(slot: PublicSlotWithCapacity) {
  return getRemainingCapacity(slot) < 1;
}

export function formatDateGroupLabel(iso: string) {
  return dateGroupFormatter.format(new Date(iso));
}

export function formatDateGroupKey(iso: string) {
  return dateKeyFormatter.format(new Date(iso));
}

export function formatTimeRange(startsAt: string, endsAt: string) {
  return `${timeFormatter.format(new Date(startsAt))} - ${timeFormatter.format(new Date(endsAt))}`;
}

export function formatSlotDateTimeLabel(startsAt: string, endsAt: string) {
  return `${formatDateGroupLabel(startsAt)} at ${formatTimeRange(startsAt, endsAt)}`;
}

export function clampParticipants(value: number, remaining: number) {
  if (remaining < 1) {
    return 1;
  }

  if (!Number.isFinite(value)) {
    return 1;
  }

  const next = Math.trunc(value);
  return Math.min(Math.max(next, 1), remaining);
}

export function getAvailabilitySummary(slot: PublicSlotWithCapacity): AvailabilitySummary {
  const remaining = getRemainingCapacity(slot);
  const detail = `${remaining} of ${slot.max_capacity} spots remaining`;

  if (remaining < 1) {
    return {
      tone: "sold-out",
      badge: "Sold out",
      detail,
    };
  }

  if (remaining <= LOW_INVENTORY_THRESHOLD) {
    return {
      tone: "low",
      badge: `Only ${remaining} left`,
      detail,
    };
  }

  return {
    tone: "available",
    badge: `${remaining} spots left`,
    detail,
  };
}

export function groupSlotsByDate(slots: PublicSlotWithCapacity[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();
  const orderedGroups: SlotGroup[] = [];

  for (const slot of slots) {
    const key = formatDateGroupKey(slot.starts_at);
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        label: formatDateGroupLabel(slot.starts_at),
        slots: [],
        departureCount: 0,
        availableCount: 0,
        soldOut: false,
      };
      groups.set(key, group);
      orderedGroups.push(group);
    }

    group.slots.push(slot);
  }

  for (const group of orderedGroups) {
    group.slots.sort((left, right) => {
      const leftSoldOut = isSlotSoldOut(left);
      const rightSoldOut = isSlotSoldOut(right);

      if (leftSoldOut !== rightSoldOut) {
        return leftSoldOut ? 1 : -1;
      }

      return Date.parse(left.starts_at) - Date.parse(right.starts_at);
    });

    group.departureCount = group.slots.length;
    group.availableCount = group.slots.filter((slot) => !isSlotSoldOut(slot)).length;
    group.soldOut = group.availableCount === 0;
  }

  return orderedGroups;
}

export function shouldRefreshAvailabilityAfterCartError(message: string) {
  return [
    "This slot is no longer available",
    "Not enough spots left for this time slot",
    "Activity is not available for booking",
  ].includes(message);
}
