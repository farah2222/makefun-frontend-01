// A make.fun frontend: the board, a bounty's page, its leaderboard and an
// account's profile, on hash routes.
//
//   #/                              the board
//   #/bounty/<slug>                 one bounty
//   #/bounty/<slug>/leaderboard     its leaderboard
//   #/bounty/<slug>/leaderboard/<n> one leaderboard page
//   #/u/<handle>                    an account's public profile
//
// The leaderboard and profile views load only when a route needs them
// (import('./views-extra.js')), so their bytes stay out of the first load.
//
// window.__shotReady is false while a page loads and true once its data is
// on screen, so a screenshot script knows when to capture.

import { cached, getBounties, getBounty, getLeaderboard, getProfile, lastFetched } from './api.js';
import { boardList, boardView, errorView } from './views.js';
import { esc, norm, timeLeft } from './format.js';

const app = document.getElementById('app');
const BOARD_PATH = '/competitions?status=open&activity=times';
let ticker = null;
let boardData = null;
let leaderboardData = null;
let leaderboardSlug = '';
let leaderboardAt = 0;
// The board's controls, all applied to the data we hold: no new request.
let boardFilter = 'all';
let boardQuery = '';
let boardSort = 'deadline';

/** Stop the countdown ticker (a route change starts a fresh one). */
function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

/** Refresh every ticking time-left on screen, without rebuilding the page. */
function startTicker() {
  stopTicker();
  // No deadlines on this page, nothing to tick: leave the timer off.
  if (!app.querySelector('[data-deadline]')) return;
  ticker = setInterval(() => {
    app.querySelectorAll('[data-deadline]').forEach((el) => {
      el.textContent = timeLeft(el.getAttribute('data-deadline'));
    });
  }, 30000);
}

/** Hide avatar images that failed to load, leaving the handle's initial. */
function fixAvatars() {
  app.querySelectorAll('img[data-avatar]').forEach((img) => {
    img.addEventListener('error', () => img.classList.add('broken'));
    if (img.complete && img.naturalWidth === 0) img.classList.add('broken');
  });
}

/** Which board rows a filter keeps. */
function filterBoard(items, filter) {
  const now = Date.now();
  if (filter === 'open') return items.filter((b) => new Date(b.deadline).getTime() > now);
  if (filter === 'closing') {
    return items.filter((b) => {
      const ms = new Date(b.deadline).getTime() - now;
      return ms > 0 && ms < 86400000;
    });
  }
  return items;
}

/** Which board rows a search keeps: title, category or slug, case-insensitive. */
function searchBoard(items, query) {
  const q = norm(query);
  if (!q) return items;
  return items.filter((b) => norm(`${b.title} ${b.category || ''} ${b.slug}`).includes(q));
}

/** Order the board rows: soonest deadline, biggest pot, or most entries. */
function sortBoard(items, sortKey) {
  const rows = items.slice();
  if (sortKey === 'pot') return rows.sort((a, b) => (Number(b.potUsd ?? b.rewardAmount) || 0) - (Number(a.potUsd ?? a.rewardAmount) || 0));
  if (sortKey === 'entries') return rows.sort((a, b) => (b.submissionCount || 0) - (a.submissionCount || 0));
  return rows.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

/** The board rows the current search, sort and filter keep. */
function visibleBoard() {
  if (!boardData) return [];
  return sortBoard(filterBoard(searchBoard(boardData.items, boardQuery), boardFilter), boardSort);
}

/** Re-render the board list from the data we hold: search, sort and filter all land here, no new request. */
function refreshBoard() {
  if (!boardData) return;
  const items = visibleBoard();
  const list = app.querySelector('.board');
  if (list) list.innerHTML = boardList(items);
  const count = document.getElementById('board-count');
  if (count) count.textContent = boardQuery || boardFilter !== 'all' ? `${items.length} of ${boardData.items.length} bounties` : `${items.length} bounties`;
  const empty = document.getElementById('board-empty');
  if (empty) empty.hidden = items.length !== 0;
  startTicker();
}

/** The board's filter buttons: filter the list from the data we hold, no new request. */
function wireFilters() {
  const group = app.querySelector('.filters');
  if (!group) return;
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button || !boardData) return;
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    boardFilter = button.getAttribute('data-filter');
    refreshBoard();
  });
}

/** The board's search box: narrows the list as you type, from the data we hold. */
function wireSearch() {
  const input = document.getElementById('board-search');
  if (!input) return;
  input.addEventListener('input', () => {
    boardQuery = input.value;
    refreshBoard();
  });
}

/** The board's sort control: re-orders the list from the data we hold. */
function wireSort() {
  const select = document.getElementById('board-sort');
  if (!select) return;
  select.addEventListener('change', () => {
    boardSort = select.value;
    refreshBoard();
  });
}

/** Prefetch: hovering a bounty link, or landing keyboard focus on it,
    fetches that bounty in the background, so the click that follows renders
    from the cache instead of waiting on the network. A failed prefetch is
    not an error — the click still fetches for real, and the slug is forgotten
    so a later hover tries again. */
const prefetchedSlugs = new Set();
function bountySlugFromLink(link) {
  const href = link.getAttribute('href') || '';
  const m = href.match(/^#\/(?:bounty|split)\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function prefetchBounty(slug) {
  if (!slug || prefetchedSlugs.has(slug)) return;
  prefetchedSlugs.add(slug);
  getBounty(slug).catch(() => {
    prefetchedSlugs.delete(slug);
  });
}
function wirePrefetch() {
  // One delegated listener each: the board list is re-rendered on every
  // search, sort and filter, so wiring each link would not survive it.
  app.addEventListener('mouseover', (event) => {
    const link = event.target.closest ? event.target.closest('a.title') : null;
    if (!link) return;
    prefetchBounty(bountySlugFromLink(link));
  });
  app.addEventListener('focusin', (event) => {
    const link = event.target.closest ? event.target.closest('a.title') : null;
    if (!link) return;
    prefetchBounty(bountySlugFromLink(link));
  });
}

/** The bounties the reader opened most recently, newest first, kept for
    this session only: a quick way back to a bounty just looked at. */
const recentSlugs = [];
function noteViewed(slug) {
  if (!slug) return;
  const at = recentSlugs.indexOf(slug);
  if (at >= 0) recentSlugs.splice(at, 1);
  recentSlugs.unshift(slug);
  if (recentSlugs.length > 5) recentSlugs.length = 5;
}
function recentStrip() {
  if (!boardData || recentSlugs.length < 2) return '';
  const links = recentSlugs.map((slug) => {
    const b = boardData.items.find((item) => item.slug === slug);
    if (!b) return '';
    return `<a href="#/bounty/${encodeURIComponent(slug)}">${esc(b.title)}</a>`;
  }).filter(Boolean).join(' · ');
  if (!links) return '';
  return `<p class="recent">Recently viewed: ${links}</p>`;
}

/** Press "/" anywhere to jump to the board's search box, so the reader can
    filter without reaching for the mouse. It stays out of the way while the
    reader is already typing in a field. */
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
  const input = document.getElementById('board-search');
  if (!input) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  input.focus();
});

/** Show a page: fix avatars, start the countdowns, move focus to the new page, mark the shot ready. */
function show(html) {
  app.innerHTML = html;
  fixAvatars();
  startTicker();
  window.scrollTo(0, 0);
  // Move keyboard and screen-reader focus to the page that just rendered
  // (the main element is focusable with tabindex="-1").
  app.focus({ preventScroll: true });
  window.__shotReady = true;
}

/** An error page with a working retry button. */
function showError(err) {
  app.innerHTML = errorView(err);
  const retry = document.getElementById('retry');
  if (retry) retry.addEventListener('click', render);
  window.__shotReady = true;
}

/** Fetch a page's data, falling back to the cached copy when the API fails. */
async function fetchPage(path, fetchFn) {
  try {
    return { data: await fetchFn(), stale: false };
  } catch (err) {
    const data = cached(path);
    if (data) return { data, stale: true };
    throw err;
  }
}

/** The board. */
async function routeBoard() {
  try {
    const { data, stale } = await fetchPage(BOARD_PATH, getBounties);
    boardData = data;
    document.title = 'make.fun bounties';
    show(boardView(data, stale, lastFetched(BOARD_PATH)));
    const strip = recentStrip();
    if (strip) app.insertAdjacentHTML('beforeend', strip);
    wireFilters();
    wireSearch();
    wireSort();
  } catch (err) {
    showError(err);
  }
}

/** One bounty. */
async function routeBounty(slug) {
  try {
    const path = `/competitions/${encodeURIComponent(slug)}`;
    const { data, stale } = await fetchPage(path, () => getBounty(slug));
    const { bountyView } = await import('./views-extra.js');
    document.title = `${data.title} | make.fun bounties`;
    show(bountyView(data, stale, lastFetched(path)));
    noteViewed(slug);
  } catch (err) {
    showError(err);
  }
}

/** Master-detail: the live board beside one bounty, both from the API. */
async function routeSplit(slug) {
  try {
    const path = `/competitions/${encodeURIComponent(slug)}`;
    const [board, bounty] = await Promise.all([
      fetchPage(BOARD_PATH, getBounties),
      fetchPage(path, () => getBounty(slug)),
    ]);
    const { splitView, wireSplitKeys } = await import('./views-extra.js');
    boardData = board.data;
    document.title = `${bounty.data.title} beside the board | make.fun bounties`;
    show(splitView(board.data, bounty.data, board.stale || bounty.stale, lastFetched(path)));
    wireSplitKeys();
    noteViewed(slug);
  } catch (err) {
    showError(err);
  }
}

/** A bounty's leaderboard, one page at a time. */
async function routeLeaderboard(slug, page) {
  try {
    let data;
    let stale = false;
    if (leaderboardSlug === slug && leaderboardData && Date.now() - leaderboardAt < 60000) {
      data = leaderboardData; // paging reuses the data we hold: no new request
    } else {
      const res = await fetchPage(`/competitions/${encodeURIComponent(slug)}/leaderboard`, () => getLeaderboard(slug));
      data = res.data;
      stale = res.stale;
      leaderboardSlug = slug;
      leaderboardData = data;
      leaderboardAt = Date.now();
    }
    const { leaderboardView, wireLeaderboard } = await import('./views-extra.js');
    document.title = `Leaderboard | ${data.competition ? data.competition.title : slug} | make.fun bounties`;
    show(leaderboardView(data, page, stale));
    wireLeaderboard(data, page);
  } catch (err) {
    showError(err);
  }
}

/** An account's public profile. */
async function routeProfile(handle) {
  try {
    const { data, stale } = await fetchPage(`/profiles/${encodeURIComponent(handle)}`, () => getProfile(handle));
    const { profileView } = await import('./views-extra.js');
    document.title = `@${data.handle} | make.fun bounties`;
    show(profileView(data, stale));
  } catch (err) {
    showError(err);
  }
}

/** Pick the route for the current hash and render it. */
async function render() {
  window.__shotReady = false;
  stopTicker();
  app.innerHTML = '<p>Loading…</p>';
  const hash = location.hash || '#/';
  let m;
  if ((m = hash.match(/^#\/split\/([^/]+)$/))) {
    await routeSplit(decodeURIComponent(m[1]));
  } else if ((m = hash.match(/^#\/bounty\/([^/]+)\/leaderboard(?:\/(\d+))?$/))) {
    await routeLeaderboard(decodeURIComponent(m[1]), Number(m[2] || 1));
  } else if ((m = hash.match(/^#\/bounty\/([^/]+)$/))) {
    await routeBounty(decodeURIComponent(m[1]));
  } else if ((m = hash.match(/^#\/u\/([^/]+)$/))) {
    await routeProfile(decodeURIComponent(m[1]));
  } else {
    await routeBoard();
  }
}

window.addEventListener('hashchange', render);
wirePrefetch();
render();
