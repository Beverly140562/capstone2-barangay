
const TOKEN_KEY = 'luinab_token';

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
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith('/')
  ? path
  : `/${path}`;

const res = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const isCsv = contentType.includes('text/csv');

  // --------------------------------------------------
  // SESSION EXPIRED
  // --------------------------------------------------
  if (res.status === 401 && path !== '/auth/login') {
    clearToken();
    window.location.href = '/login';

    const error = new Error('Session expired.');
    error.status = 401;
    error.response = { status: 401 };

    throw error;
  }

  // --------------------------------------------------
  // HTTP ERROR
  // --------------------------------------------------
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;

    // Read as text first so an empty/non-JSON response
    // does not cause another JSON parsing error.
    const errorText = await res.text();

    if (errorText.trim()) {
      try {
        const data = JSON.parse(errorText);

        if (data?.error) {
          message = data.error;
        } else if (data?.message) {
          message = data.message;
        }
      } catch (e) {
        // Server returned non-JSON text.
        // Use the response text as the error message.
        message = errorText.trim() || message;
      }
    }

    const error = new Error(message);

    error.status = res.status;

    error.response = {
      status: res.status,
      data: {
        error: message,
      },
    };

    throw error;
  }

  // --------------------------------------------------
  // CSV RESPONSE
  // --------------------------------------------------
  if (isCsv) {
    return res.text();
  }

  // --------------------------------------------------
  // SUCCESS RESPONSE
  // --------------------------------------------------
  const text = await res.text();

  // Prevent:
  // "Unexpected end of JSON input"
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(
      `Invalid JSON response from ${path}:`,
      text
    );

    const error = new Error(
      `Invalid JSON response from ${path}.`
    );

    error.status = res.status;
    error.response = {
      status: res.status,
      data: {
        error: error.message,
      },
    };

    throw error;
  }
}

export const api = {
  get: (p) =>
    request(p),

  post: (p, body) =>
    request(p, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  put: (p, body) =>
    request(p, {
      method: 'PUT',
      body: JSON.stringify(body || {}),
    }),

  patch: (p, body) =>
    request(p, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    }),

  del: (p) =>
    request(p, {
      method: 'DELETE',
    }),
};