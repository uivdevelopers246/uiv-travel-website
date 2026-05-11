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
      kind: "capacity";
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
  if (typeof line.participants !== "number" || !Number.isFinite(line.participants)) {
    return 1;
  }

  return Math.max(1, Math.trunc(line.participants));
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
  return getUnitPriceCents(line) * Math.max(1, Math.trunc(participants));
}

export function getCartSummary(lines: CartLineWithPreview[]): CartSummary {
  const participantCount = lines.reduce(
    (sum, line) => sum + getLineParticipants(line),
    0,
  );
  const subtotalCents = lines.reduce(
    (sum, line) => sum + getLineTotalCents(line.line_total_cents),
    0,
  );

  return {
    activityCount: lines.length,
    participantCount,
    subtotalCents,
    totalCents: subtotalCents,
  };
}

export function getCartLineAvailabilityState(
  line: CartLineWithPreview,
): CartLineAvailabilityState {
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
        invalidLines === 1
          ? "Resolve the unavailable or over-capacity request in your cart before saving a payment method."
          : "Resolve the unavailable or over-capacity requests in your cart before saving a payment method.",
    };
  }

  if (input.dirtyLineCount > 0) {
    return {
      disabled: true,
      label: "Save payment method",
      supportText:
        "No charge today. Save or reset your participant edits first, then continue to secure checkout.",
      blockingMessage:
        input.dirtyLineCount === 1
          ? "Save or reset the participant change on 1 activity before continuing."
          : `Save or reset the participant changes on ${input.dirtyLineCount} activities before continuing.`,
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
      "No charge today. Stripe saves your payment method first and only charges confirmed bookings after vendor approval.",
    blockingMessage: null,
  };
}
