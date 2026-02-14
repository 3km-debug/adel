export async function fetchJson(url, {
  method = 'GET',
  headers = {},
  body,
  timeoutMs = 10_000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} ${response.statusText}`);
      error.status = response.status;
      error.payload = parsed;
      throw error;
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
