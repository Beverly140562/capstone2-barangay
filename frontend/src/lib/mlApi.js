const ML_API_URL = (
  import.meta.env.VITE_ML_API_URL || ''
).trim().replace(/\/+$/, '');

async function mlRequest(path, options = {}) {
  if (!ML_API_URL) {
    throw new Error(
      'ML service URL is not configured. Set VITE_ML_API_URL in your frontend environment.'
    );
  }

  const response = await fetch(`${ML_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `ML request failed: ${response.status}`);
  }

  return response.json();
}

function buildQueryString(query = '') {
  if (typeof query === 'string') {
    if (!query) return '';
    return query.startsWith('?') ? query : `?${query}`;
  }

  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      params.set(key, String(value));
    }
  });

  const result = params.toString();
  return result ? `?${result}` : '';
}

export const mlApi = {
  getAnalytics: (query = '') =>
    mlRequest(`/analytics${buildQueryString(query)}`),

  predict: async (data) => {
    console.log('ML PREDICTION REQUEST:', data);

    const result = await mlRequest('/predict', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    console.log('ML PREDICTION RESPONSE:', result);
    console.log('SUGGESTED PROGRAMS:', result?.suggested_programs);

    return result;
  },

  predictBatch: (data) =>
    mlRequest('/predict-batch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  retrain: (data) =>
    mlRequest('/retrain', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
};
