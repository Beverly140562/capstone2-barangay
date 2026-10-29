const TOKEN_KEY = 'luinab_token';

// Local development can use /api through the Vite proxy.
// Vercel must set VITE_API_URL to the Render backend URL,
// without an /api suffix.
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || '/api'
).replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`;

  const token = getToken();

  const headers = {
    ...(options.body !== undefined
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `${API_BASE_URL}${normalizedPath}`,
    {
      ...options,
      headers,
    }
  );

  const contentType = res.headers.get('content-type') || '';
  const isCsv = contentType.includes('text/csv');

  // Handle expired or invalid sessions.
  if (
    res.status === 401 &&
    normalizedPath !== '/auth/login'
  ) {
    clearToken();
    window.location.href = '/login';

    const error = new Error('Session expired.');
    error.status = 401;
    error.response = {
      status: 401,
      data: { error: 'Session expired.' },
    };

    throw error;
  }

  // Handle HTTP errors, including non-JSON responses.
  if (!res.ok) {
    const errorText = await res.text();
    let message = `Request failed (${res.status}).`;

    if (errorText.trim()) {
      try {
        const data = JSON.parse(errorText);
        message = data?.error || data?.message || message;
      } catch {
        message = errorText.trim();
      }
    }

    const error = new Error(message);
    error.status = res.status;
    error.response = {
      status: res.status,
      data: { error: message },
    };

    throw error;
  }

  // Return CSV as text.
  if (isCsv) {
    return res.text();
  }

  // Safely handle empty and JSON responses.
  const responseText = await res.text();

  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    console.error(
      `Invalid JSON response from ${normalizedPath}:`,
      responseText
    );

    const error = new Error(
      `Invalid JSON response from ${normalizedPath}.`
    );

    error.status = res.status;
    error.response = {
      status: res.status,
      data: { error: error.message },
    };

    throw error;
  }
}

export const api = {
  get: (path) => request(path),

  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  put: (path, body) =>
    request(path, {
      method: 'PUT',
      body: JSON.stringify(body ?? {}),
    }),

  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(body ?? {}),
    }),

  del: (path) =>
    request(path, {
      method: 'DELETE',
    }),
};
