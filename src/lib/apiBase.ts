const configuredApiBase = import.meta.env.VITE_API_BASE;

export const API_BASE =
  (configuredApiBase ??
    (import.meta.env.PROD ? "" : "http://127.0.0.1:8000")).replace(/\/$/, "");

export const apiUrl = (path: string) => `${API_BASE}${path}`;
