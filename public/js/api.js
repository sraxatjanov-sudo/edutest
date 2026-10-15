// Server bilan aloqa
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(url, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Server bilan aloqa yo\'q. Internet ulanishini tekshiring');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiError(res.status, data.error || `Xatolik (${res.status})`);
  }
  return data;
}

export const get = (url, opts) => api(url, opts);
export const post = (url, body = {}) => api(url, { method: 'POST', body });
export const put = (url, body = {}) => api(url, { method: 'PUT', body });
export const patch = (url, body = {}) => api(url, { method: 'PATCH', body });
export const del = (url) => api(url, { method: 'DELETE', body: {} });
