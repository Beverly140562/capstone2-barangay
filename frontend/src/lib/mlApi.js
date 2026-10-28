
const ML_API_URL = 'http://127.0.0.1:5001';

async function mlRequest(path, options = {}) {
  const response = await fetch(`${ML_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const contentType =
    response.headers.get('content-type') || '';

  let data = null;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : null;
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.error ||
      data?.message ||
      `ML service request failed (${response.status}).`
    );
  }

  return data;
}

function buildQueryString(query = '') {
  if (typeof query === 'string') {
    if (!query) return '';

    return query.startsWith('?')
      ? query
      : `?${query}`;
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
  console.log(
    'SUGGESTED PROGRAMS:',
    result?.suggested_programs
  );

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
