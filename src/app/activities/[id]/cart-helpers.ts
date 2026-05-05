export function buildActivityDetailLoginRedirect(activityId: string): string {
  const redirectPath = `/activities/${activityId}`;
  return `/auth/login?redirect=${encodeURIComponent(redirectPath)}`;
}

export function getAddToCartSuccessMessage(input: {
  requestedParticipants: number;
  mergedParticipants: number;
  slotDateLabel: string;
}): string {
  const formatParticipantsLabel = (count: number) =>
    `${count} ${count === 1 ? "participant" : "participants"}`;

  if (input.mergedParticipants > input.requestedParticipants) {
    return `Updated your cart to ${formatParticipantsLabel(input.mergedParticipants)} for ${input.slotDateLabel}. Review your cart to save your payment method.`;
  }

  return `Added ${formatParticipantsLabel(input.requestedParticipants)} for ${input.slotDateLabel}. Review your cart to save your payment method and submit the request.`;
}
