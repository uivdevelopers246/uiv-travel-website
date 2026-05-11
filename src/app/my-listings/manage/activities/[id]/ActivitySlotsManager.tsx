"use client";

import { useCallback, useEffect, useState } from "react";

type ManageSlot = {
  id: string;
  activity_id: string;
  vendor_id: string;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
  off_platform_participants: number;
  is_cancelled: boolean;
  created_at: string;
  updated_at: string;
  booked_participants: number;
};

type SlotMessage = {
  type: "success" | "error";
  text: string;
};

type SlotModalState =
  | {
      mode: "create";
      slot: null;
    }
  | {
      mode: "edit";
      slot: ManageSlot;
    }
  | null;

type SlotFormState = {
  starts_at: string;
  max_capacity: string;
  off_platform_participants: string;
};

type Props = {
  activityId: string;
};

const slotDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const slotTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function toDateTimeLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const localMs = date.getTime() - date.getTimezoneOffset() * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 16);
}

function toIsoStringFromLocalInput(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatSlotWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return `${slotDateFormatter.format(start)} - ${slotTimeFormatter.format(start)} to ${slotTimeFormatter.format(end)}`;
}

function getAvailableOnPlatform(
  maxCapacity: number,
  offPlatformParticipants: number,
  platformBooked: number,
): number {
  return maxCapacity - offPlatformParticipants - platformBooked;
}

function createEmptySlotForm(): SlotFormState {
  return {
    starts_at: "",
    max_capacity: "",
    off_platform_participants: "0",
  };
}

function createEditSlotForm(slot: ManageSlot): SlotFormState {
  return {
    starts_at: toDateTimeLocalInputValue(slot.starts_at),
    max_capacity: slot.max_capacity.toString(),
    off_platform_participants: slot.off_platform_participants.toString(),
  };
}

export function ActivitySlotsManager({ activityId }: Props) {
  const [slots, setSlots] = useState<ManageSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<SlotMessage | null>(null);
  const [modalState, setModalState] = useState<SlotModalState>(null);
  const [form, setForm] = useState<SlotFormState>(createEmptySlotForm);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/activities/${activityId}/slots/manage`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Could not load availability slots for this activity.",
        );
      }

      setSlots(Array.isArray(payload) ? (payload as ManageSlot[]) : []);
    } catch (error: unknown) {
      const text =
        error instanceof Error
          ? error.message
          : "Could not load availability slots for this activity.";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSlots();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadSlots]);

  const editingSlot = modalState?.mode === "edit" ? modalState.slot : null;
  const platformBooked = editingSlot?.booked_participants ?? 0;
  const parsedMaxCapacity = Number(form.max_capacity);
  const parsedOffPlatformParticipants = Number(form.off_platform_participants);
  const availableOnPlatform =
    editingSlot &&
    Number.isInteger(parsedMaxCapacity) &&
    Number.isInteger(parsedOffPlatformParticipants)
      ? getAvailableOnPlatform(
          parsedMaxCapacity,
          parsedOffPlatformParticipants,
          platformBooked,
        )
      : null;
  const capacityValidationError =
    editingSlot &&
    Number.isInteger(parsedMaxCapacity) &&
    Number.isInteger(parsedOffPlatformParticipants) &&
    parsedOffPlatformParticipants + platformBooked > parsedMaxCapacity
      ? "Off-platform participants plus current platform bookings cannot exceed max capacity."
      : null;
  const capacityWarning =
    editingSlot &&
    availableOnPlatform !== null &&
    availableOnPlatform >= 0 &&
    availableOnPlatform < platformBooked
      ? `Warning: this leaves only ${availableOnPlatform} seats available on platform while ${platformBooked} participants are already booked on platform.`
      : null;

  function openCreateModal() {
    setForm(createEmptySlotForm());
    setModalState({ mode: "create", slot: null });
  }

  function openEditModal(slot: ManageSlot) {
    setForm(createEditSlotForm(slot));
    setModalState({ mode: "edit", slot });
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalState(null);
    setForm(createEmptySlotForm());
  }

  function updateField(field: keyof SlotFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const startsAt = toIsoStringFromLocalInput(form.starts_at);
    if (!startsAt) {
      setMessage({
        type: "error",
        text: "Start time must be a valid date and time.",
      });
      setSaving(false);
      return;
    }

    if (!Number.isInteger(parsedMaxCapacity) || parsedMaxCapacity < 1) {
      setMessage({
        type: "error",
        text: "Max capacity must be an integer of at least 1.",
      });
      setSaving(false);
      return;
    }

    if (modalState?.mode === "edit") {
      if (
        !Number.isInteger(parsedOffPlatformParticipants) ||
        parsedOffPlatformParticipants < 0
      ) {
        setMessage({
          type: "error",
          text: "Off-platform participants must be a non-negative integer.",
        });
        setSaving(false);
        return;
      }

      if (capacityValidationError) {
        setMessage({ type: "error", text: capacityValidationError });
        setSaving(false);
        return;
      }
    }

    const endpoint =
      modalState?.mode === "edit"
        ? `/api/slots/${modalState.slot.id}`
        : `/api/activities/${activityId}/slots`;
    const method = modalState?.mode === "edit" ? "PATCH" : "POST";
    const payload =
      modalState?.mode === "edit"
        ? {
            starts_at: startsAt,
            max_capacity: parsedMaxCapacity,
            off_platform_participants: parsedOffPlatformParticipants,
          }
        : {
            starts_at: startsAt,
            max_capacity: parsedMaxCapacity,
          };

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error ??
            `Could not ${modalState?.mode === "edit" ? "update" : "create"} the slot.`,
        );
      }

      await loadSlots();
      setMessage({
        type: "success",
        text:
          modalState?.mode === "edit"
            ? "Slot updated successfully."
            : "Slot created successfully.",
      });
      closeModal();
    } catch (error: unknown) {
      const text =
        error instanceof Error
          ? error.message
          : `Could not ${modalState?.mode === "edit" ? "update" : "create"} the slot.`;
      setMessage({ type: "error", text });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(slot: ManageSlot) {
    if (
      !confirm(
        "Cancel this slot? Guests will no longer be able to book it on the platform.",
      )
    ) {
      return;
    }

    setCancellingId(slot.id);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/activities/${activityId}/slots/${slot.id}`,
        {
          method: "DELETE",
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not cancel the slot.");
      }

      await loadSlots();
      setMessage({ type: "success", text: "Slot cancelled successfully." });
    } catch (error: unknown) {
      const text =
        error instanceof Error ? error.message : "Could not cancel the slot.";
      setMessage({ type: "error", text });
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Slot Management
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage departure times and reserve capacity already sold off
            platform.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-[#FBCA1A] px-4 py-2 text-sm font-semibold text-[#193059] transition-colors hover:bg-[#f5c000]"
        >
          Add Slot
        </button>
      </div>

      {message ? (
        <div
          className={`mb-4 rounded-lg p-4 text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          Loading slots...
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
          No slots yet. Add your first departure time to start taking bookings.
        </div>
      ) : (
        <div className="space-y-4">
          {slots.map((slot) => {
            const available = getAvailableOnPlatform(
              slot.max_capacity,
              slot.off_platform_participants,
              slot.booked_participants,
            );

            return (
              <article
                key={slot.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {formatSlotWindow(slot.starts_at, slot.ends_at)}
                      </h3>
                      {slot.is_cancelled ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                          Cancelled
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Available on platform: {available}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(slot)}
                      className="rounded-lg border border-[#407FC2] px-4 py-2 text-sm font-medium text-[#407FC2] transition-colors hover:bg-[#407FC2] hover:text-white"
                    >
                      Edit
                    </button>
                    {!slot.is_cancelled ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(slot)}
                        disabled={cancellingId === slot.id}
                        className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
                      >
                        {cancellingId === slot.id ? "Cancelling..." : "Cancel Slot"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Max capacity
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-900">
                      {slot.max_capacity}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Platform booked
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-900">
                      {slot.booked_participants}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Off-platform
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-900">
                      {slot.off_platform_participants}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Available on platform
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-900">
                      {available}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      {modalState ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-modal-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="slot-modal-title"
                  className="text-xl font-semibold text-slate-900"
                >
                  {modalState.mode === "edit" ? "Edit Slot" : "Create Slot"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {modalState.mode === "edit"
                    ? "Adjust timing and hold back seats sold on other channels."
                    : "Create a new departure time for this activity."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Start time
                </label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(event) =>
                    updateField("starts_at", event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#407FC2]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Max capacity
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.max_capacity}
                  onChange={(event) =>
                    updateField("max_capacity", event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#407FC2]"
                  required
                />
              </div>

              {editingSlot ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Off-platform participants
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.off_platform_participants}
                      onChange={(event) =>
                        updateField(
                          "off_platform_participants",
                          event.target.value,
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#407FC2]"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Use this for seats sold by phone or other booking
                      platforms.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="font-semibold text-slate-900">
                      Platform booked: {platformBooked}
                    </p>
                    <p className="mt-1 text-slate-700">
                      Available on platform:{" "}
                      {availableOnPlatform ?? "Enter capacity values"}
                    </p>
                  </div>

                  {capacityWarning ? (
                    <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                      {capacityWarning}
                    </div>
                  ) : null}

                  {capacityValidationError ? (
                    <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">
                      {capacityValidationError}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || Boolean(capacityValidationError)}
                  className="rounded-lg bg-gradient-to-r from-[#407FC2] to-[#193059] px-5 py-2 text-sm font-semibold text-white transition-all duration-300 hover:from-[#193059] hover:to-[#407FC2] disabled:opacity-60"
                >
                  {saving
                    ? modalState.mode === "edit"
                      ? "Saving..."
                      : "Creating..."
                    : modalState.mode === "edit"
                      ? "Save Slot"
                      : "Create Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
