// Log an error with the context it happened in, so the browser console
// shows where it came from.
export function logError(
  context: string,
  error: any,
  data?: Record<string, any>
): void {
  console.error(`[${context}]`, error, data);
}

// Log a warning (non-error event worth noting)
export function logWarning(
  context: string,
  message: string,
  data?: Record<string, any>
): void {
  console.warn(`[${context}]`, message, data);
}
