const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const slotDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const slotTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatCurrencyFromCents(value: number): string {
  return currencyFormatter.format(value / 100);
}

export function formatParticipantsLabel(count: number): string {
  return formatCount(count, "participant", "participants");
}

export function formatSpotLabel(count: number): string {
  return formatCount(count, "spot", "spots");
}

export function formatSlotDateTime(startsAt: string, endsAt: string): string {
  if (!startsAt || !endsAt) {
    return "Date and time unavailable";
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return `${slotDateFormatter.format(start)} - ${slotTimeFormatter.format(start)} to ${slotTimeFormatter.format(end)}`;
}
