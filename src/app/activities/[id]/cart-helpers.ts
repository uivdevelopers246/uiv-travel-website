export function buildActivityDetailLoginRedirect(activityId: string): string {
  const redirectPath = `/activities/${activityId}`;
  return `/auth/login?redirect=${encodeURIComponent(redirectPath)}`;
}

export function getAddToCartSuccessMessage(input: {
  requestedParticipants: number;
  mergedParticipants: number;
  slotDateTimeLabel: string;
}): string {
  const formatParticipantsLabel = (count: number) =>
    `${count} ${count === 1 ? "participant" : "participants"}`;

  if (input.mergedParticipants > input.requestedParticipants) {
    return `Updated your cart to ${formatParticipantsLabel(input.mergedParticipants)} for ${input.slotDateTimeLabel}. Review your cart to save a payment method. You will only be charged later if the vendor confirms availability.`;
  }

  return `Added ${formatParticipantsLabel(input.requestedParticipants)} for ${input.slotDateTimeLabel}. Review your cart to save a payment method. You will only be charged later if the vendor confirms availability.`;
}
