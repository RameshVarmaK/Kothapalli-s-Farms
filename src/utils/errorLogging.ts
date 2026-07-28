interface ErrorLog {
  timestamp: number;
  context: string;
  message: string;
  stack?: string;
  data?: Record<string, any>;
  userAgent: string;
  url: string;
}

const MAX_LOCAL_ERRORS = 50;
const ERROR_LOG_KEY = 'farm_ledger_error_logs';

// Get or initialize error log from localStorage
function getLocalErrorLogs(): ErrorLog[] {
  try {
    const stored = localStorage.getItem(ERROR_LOG_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save error logs to localStorage
function saveLocalErrorLogs(logs: ErrorLog[]): void {
  try {
    // Keep only the most recent MAX_LOCAL_ERRORS
    const recent = logs.slice(0, MAX_LOCAL_ERRORS);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(recent));
  } catch (err) {
    console.warn('Failed to save error logs:', err);
  }
}

// Send error to backend service
async function sendErrorToBackend(error: ErrorLog): Promise<void> {
  try {
    const endpoint = process.env.REACT_APP_ERROR_LOG_ENDPOINT || '/api/errors';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error),
      // Don't wait for response; fire-and-forget
      keepalive: true
    }).catch(() => {
      // Silently ignore network errors to avoid error loops
    });
  } catch (err) {
    // Silently fail
  }
}

// Main error logging function
export function logError(
  context: string,
  error: any,
  data?: Record<string, any>
): void {
  const errorLog: ErrorLog = {
    timestamp: Date.now(),
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    data,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  // Log to console in development
  console.error(`[${context}]`, error, data);

  // Save to localStorage for local inspection
  const logs = getLocalErrorLogs();
  saveLocalErrorLogs([errorLog, ...logs]);

  // Send to backend asynchronously (fire-and-forget)
  sendErrorToBackend(errorLog);
}

// Log a warning (non-error event worth noting)
export function logWarning(
  context: string,
  message: string,
  data?: Record<string, any>
): void {
  console.warn(`[${context}]`, message, data);

  const errorLog: ErrorLog = {
    timestamp: Date.now(),
    context: `WARNING: ${context}`,
    message,
    data,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  const logs = getLocalErrorLogs();
  saveLocalErrorLogs([errorLog, ...logs]);

  // Send to backend asynchronously
  sendErrorToBackend(errorLog);
}

// Get locally stored error logs (for debugging)
export function getErrorLogs(): ErrorLog[] {
  return getLocalErrorLogs();
}

// Clear error logs
export function clearErrorLogs(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
  } catch (err) {
    console.warn('Failed to clear error logs:', err);
  }
}

// Export error logs as JSON (for user to send to support)
export function exportErrorLogs(): string {
  const logs = getLocalErrorLogs();
  return JSON.stringify(logs, null, 2);
}
