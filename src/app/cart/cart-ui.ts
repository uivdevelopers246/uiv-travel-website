import { formatParticipantsLabel, formatSpotLabel } from "@/lib/utils/formatting";
import type { CartLineWithPreview } from "@/lib/cart/types";

export { formatParticipantsLabel, formatSpotLabel };

export type CartBannerTone = "success" | "warning" | "error";

export type CartLineAvailabilityState =
  | {
      kind: "valid";
      tone: "success";
      title: string;
      detail: string;
      canEditParticipants: true;
    }
  | {
      kind: "capacity" | "price_changed";
      tone: "warning";
      title: string;
      detail: string;
      canEditParticipants: boolean;
    }
  | {
      kind: "unavailable";
      tone: "error";
      title: string;
      detail: string;
      canEditParticipants: false;
    };

export type CartSummary = {
  activityCount: number;
  accommodationCount: number;
  participantCount: number;
  subtotalCents: number;
  totalCents: number;
};

export type CheckoutCallToActionState = {
  disabled: boolean;
  label: string;
  supportText: string;
  blockingMessage: string | null;
};

function normalizeWholeNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function getLineParticipants(line: CartLineWithPreview): number {
  const quantity = line.line_type === "accommodation" ? line.guests : line.participants;
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return 1;
  }

  return Math.max(1, Math.trunc(quantity));
}

export function getLineTotalCents(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function getUnitPriceCents(line: CartLineWithPreview): number {
  if (typeof line.unit_price_cents !== "number" || !Number.isFinite(line.unit_price_cents)) {
    return 0;
  }

  return Math.max(0, Math.round(line.unit_price_cents));
}

export function getDraftLineTotalCents(
  line: CartLineWithPreview,
  participants: number,
): number {
  return line.line_type === "accommodation"
    ? getLineTotalCents(line.line_total_cents)
    : getUnitPriceCents(line) * Math.max(1, Math.trunc(participants));
}

export function getSavedStayNightlyPrices(line: CartLineWithPreview) {
  const prices = line.stay_nightly_prices;
  if (line.line_type !== "accommodation" || line.stay_price_changed ||
      !prices || prices.length !== line.nights ||
      prices.reduce((sum, night) => sum + night.price_cents, 0) !== line.line_total_cents) {
    return [];
  }
  return prices;
}

export function getCartSummary(lines: CartLineWithPreview[]): CartSummary {
  const participantCount = lines.reduce(
    (sum, line) => sum + (line.line_type === "activity" ? getLineParticipants(line) : 0),
    0,
  );
  const subtotalCents = lines.reduce(
    (sum, line) => sum + getLineTotalCents(line.line_total_cents),
    0,
  );

  return {
    activityCount: lines.filter((line) => line.line_type === "activity").length,
    accommodationCount: lines.filter((line) => line.line_type === "accommodation").length,
    participantCount,
    subtotalCents,
    totalCents: subtotalCents,
  };
}

export function getCartLineAvailabilityState(
  line: CartLineWithPreview,
): CartLineAvailabilityState {
  if (line.line_type === "accommodation") {
    if (!line.accommodation_name || !line.check_in || !line.check_out ||
        line.nights < 1 || line.check_in < new Date().toISOString().slice(0, 10) ||
        !line.stay_dates_available) {
      return {
        kind: "unavailable", tone: "error", title: "Stay unavailable",
        detail: "These dates are no longer available. Remove this stay and choose new dates before continuing.",
        canEditParticipants: false,
      };
    }
    if (line.stay_price_changed) {
      return {
        kind: "price_changed", tone: "warning", title: "Nightly prices have changed",
        detail: "Your saved total is shown above. Open this stay to review the current nightly prices and add these dates to your cart again before continuing.",
        canEditParticipants: false,
      };
    }
    if (line.max_guest_capacity != null && getLineParticipants(line) > line.max_guest_capacity) {
      return {
        kind: "capacity", tone: "warning", title: "Guest count needs attention",
        detail: `This accommodation allows up to ${line.max_guest_capacity} guests. Reduce your guest count before continuing.`,
        canEditParticipants: line.max_guest_capacity > 0,
      };
    }
    return {
      kind: "valid", tone: "success", title: "Dates available to request",
      detail: "Your host must approve the stay. Dates are reserved only after you save a payment method; no charge is made at checkout.",
      canEditParticipants: true,
    };
  }
  if (!line.activity_title) {
    return {
      kind: "unavailable",
      tone: "error",
      title: "Activity unavailable",
      detail:
        "This activity is no longer available for booking. Remove it from your cart before continuing.",
      canEditParticipants: false,
    };
  }

  if (!line.slot_starts_at || !line.slot_ends_at) {
    return {
      kind: "unavailable",
      tone: "error",
      title: "Departure unavailable",
      detail:
        "This departure is no longer available. Remove it from your cart before continuing.",
      canEditParticipants: false,
    };
  }

  const participants = getLineParticipants(line);
  const remainingCapacity = normalizeWholeNumber(line.remaining_capacity);
  const bookedParticipants = normalizeWholeNumber(line.booked_participants);
  const offPlatformParticipants = normalizeWholeNumber(line.off_platform_participants);

  if (remainingCapacity < participants) {
    const availableNow =
      remainingCapacity === 0
        ? "No spots are"
        : `${remainingCapacity} ${remainingCapacity === 1 ? "spot is" : "spots are"}`;
    return {
      kind: "capacity",
      tone: "warning",
      title: "Participant count needs attention",
      detail:
        remainingCapacity > 0
          ? `${availableNow} currently available for this departure. Reduce this request to ${formatSpotLabel(
              remainingCapacity,
            )} or remove it before saving a payment method.`
          : "This departure no longer has open spots for your saved participant count. Remove it from your cart before saving a payment method.",
      canEditParticipants: remainingCapacity > 0,
    };
  }

  return {
    kind: "valid",
    tone: "success",
    title: `${remainingCapacity} ${remainingCapacity === 1 ? "spot" : "spots"} open right now`,
    detail: `${formatParticipantsLabel(
      bookedParticipants,
    )} already booked on this platform, plus ${formatParticipantsLabel(
      offPlatformParticipants,
    )} booked off-platform.`,
    canEditParticipants: true,
  };
}

export function getCheckoutCallToActionState(input: {
  lines: CartLineWithPreview[];
  dirtyLineCount: number;
  hasPendingMutation: boolean;
}): CheckoutCallToActionState {
  const invalidLines = input.lines.filter(
    (line) => getCartLineAvailabilityState(line).kind !== "valid",
  ).length;

  if (invalidLines > 0) {
    return {
      disabled: true,
      label: "Save payment method",
      supportText:
        "Checkout saves a payment method first. Stripe only charges confirmed bookings after vendor approval.",
      blockingMessage:
        input.lines.some((line) => line.stay_price_changed)
          ? "Review the changed nightly prices and add the affected stays to your cart again before saving a payment method."
          : invalidLines === 1
          ? "Resolve the unavailable or over-capacity request in your cart before saving a payment method."
          : "Resolve the unavailable or over-capacity requests in your cart before saving a payment method.",
    };
  }

  if (input.dirtyLineCount > 0) {
    return {
      disabled: true,
      label: "Save payment method",
      supportText:
        "No charge at checkout. Save or reset your guest or participant edits first, then continue to secure checkout.",
      blockingMessage:
        input.dirtyLineCount === 1
          ? "Save or reset the guest or participant change on 1 request before continuing."
          : `Save or reset the guest or participant changes on ${input.dirtyLineCount} requests before continuing.`,
    };
  }

  if (input.hasPendingMutation) {
    return {
      disabled: true,
      label: "Save payment method",
      supportText:
        "Stripe will open once your cart finishes updating. No charge is created during this step.",
      blockingMessage: "Please wait for the current cart update to finish.",
    };
  }

  return {
    disabled: false,
    label: "Save payment method",
    supportText:
      "No charge at checkout. Stripe saves your payment method first and only charges confirmed bookings after vendor approval.",
    blockingMessage: null,
  };
}
