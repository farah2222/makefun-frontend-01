// make.fun's public API: read-only GET requests, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.

const API = 'https://make.fun/api';

// One in-memory cache entry per URL: the last ETag and the data it returned.
// The API binds ETags to the minute, so a revalidation inside the same minute
// answers 304 and costs no fresh download.
const cache = new Map();

/** GET a path as JSON, revalidating with If-None-Match when we hold an ETag. */
export async function fetchJson(path) {
  const url = API + path;
  const hit = cache.get(url);
  const headers = {};
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
  const res = await fetch(url, { headers });
  if (res.status === 304 && hit) {
    hit.at = Date.now();
    return hit.data;
  }
  if (!res.ok) throw new Error(`make.fun API answered ${res.status} for ${path}`);
  const data = await res.json();
  cache.set(url, { etag: res.headers.get('ETag'), data, at: Date.now() });
  return data;
}

/** The data we already hold for a path, or null (lets a re-render skip a request). */
export function cached(path) {
  const hit = cache.get(API + path);
  return hit ? hit.data : null;
}

/** The open bounties: { items: [...] } (activity=times leaves out the activity a board does not show). */
export const getBounties = () => fetchJson('/competitions?status=open&activity=times');

/** One bounty, by its slug. */
export const getBounty = (slug) => fetchJson(`/competitions/${encodeURIComponent(slug)}`);

/** A bounty's leaderboard: { competition, phase, columns, entries: [...] }. */
export const getLeaderboard = (slug) => fetchJson(`/competitions/${encodeURIComponent(slug)}/leaderboard`);

/** An account's public profile, by its handle. */
export const getProfile = (handle) => fetchJson(`/profiles/${encodeURIComponent(handle)}`);
