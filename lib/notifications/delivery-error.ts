export class NotificationDeliveryError extends Error {
  readonly retryable: boolean;
  readonly statusCode: number | null;

  constructor(
    message: string,
    options: { retryable: boolean; statusCode?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "NotificationDeliveryError";
    this.retryable = options.retryable;
    this.statusCode = options.statusCode ?? null;
  }
}

export function isRetryableNotificationError(error: unknown): boolean {
  if (error instanceof NotificationDeliveryError) {
    return error.retryable;
  }
  return false;
}
