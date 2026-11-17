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

import { cached, getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import { boardList, boardView, bountyView, errorView } from './views.js';
import { timeLeft } from './format.js';

const app = document.getElementById('app');
const BOARD_PATH = '/competitions?status=open&activity=times';
let ticker = null;
let boardData = null;
let leaderboardData = null;
let leaderboardSlug = '';
let leaderboardAt = 0;

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

/** The board's filter buttons: filter the list from the data we hold, no new request. */
function wireFilters() {
  const group = app.querySelector('.filters');
  if (!group) return;
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button || !boardData) return;
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    const list = app.querySelector('.board');
    if (list) list.innerHTML = boardList(filterBoard(boardData.items, button.getAttribute('data-filter')));
    startTicker();
  });
}

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
    show(boardView(data, stale));
    wireFilters();
  } catch (err) {
    showError(err);
  }
}

/** One bounty. */
async function routeBounty(slug) {
  try {
    const { data, stale } = await fetchPage(`/competitions/${encodeURIComponent(slug)}`, () => getBounty(slug));
    document.title = `${data.title} | make.fun bounties`;
    show(bountyView(data, stale));
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
    const { leaderboardView } = await import('./views-extra.js');
    document.title = `Leaderboard | ${data.competition ? data.competition.title : slug} | make.fun bounties`;
    show(leaderboardView(data, page, stale));
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
  if ((m = hash.match(/^#\/bounty\/([^/]+)\/leaderboard(?:\/(\d+))?$/))) {
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
render();
