function setToken(token) {
  localStorage.setItem('user_token', token);
}
function getToken() {
  return localStorage.getItem('user_token');
}
function clearToken() {
  localStorage.removeItem('user_token');
}
function setAdminToken(token) {
  localStorage.setItem('admin_token', token);
}
function getAdminToken() {
  return localStorage.getItem('admin_token');
}
function clearAdminToken() {
  localStorage.removeItem('admin_token');
}
async function api(url, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (options.auth) headers['Authorization'] = `Bearer ${getToken()}`;
  if (options.adminAuth) headers['Authorization'] = `Bearer ${getAdminToken()}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function currency(num) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(num || 0));
}
function shortDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}
