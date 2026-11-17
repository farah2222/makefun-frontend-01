// The leaderboard and profile pages, loaded after the first load:
// main.js imports this module only when a route needs it, so its bytes
// stay out of the first-load Totals line.

import { clock, date, esc, md, money, openState, timeLeft } from './format.js';
import { boardList, fee, pot, rewardsTable, staleNote } from './views.js';

/** Rows per leaderboard page: 404 entries paginate, they never render at once. */
const PAGE = 20;

/** A virtual leaderboard row is one fixed height, so a scroll window can be
    measured without reading the page: only the rows on screen are in the DOM. */
const LB_ROW_PX = 44;
const LB_OVERSCAN = 8;
const LB_VIEWPORT_PX = 480;

/** The rows a scroll window shows: the visible rows plus a few above and below. */
function lbWindow(entries, scrollTop) {
  const total = entries.length;
  const first = Math.max(0, Math.floor(scrollTop / LB_ROW_PX) - LB_OVERSCAN);
  const visible = Math.ceil(LB_VIEWPORT_PX / LB_ROW_PX) + LB_OVERSCAN * 2;
  const last = Math.min(total, first + visible);
  return { first, last };
}

/** The rows of one scroll window, with spacers above and below so the
    scrollbar still spans the whole ranking. */
function lbWindowRows(entries, first, last) {
  const top = first * LB_ROW_PX;
  const bottom = (entries.length - last) * LB_ROW_PX;
  const spacer = (h) => (h > 0 ? `<tr class="spacer" aria-hidden="true"><td colspan="6" style="height:${h}px"></td></tr>` : '');
  return spacer(top) + entries.slice(first, last).map(leaderRow).join('') + spacer(bottom);
}

/** An API-relative image path as an absolute URL on make.fun. */
function absUrl(u) {
  return u.startsWith('/') ? `https://make.fun${u}` : u;
}

/** A win-rate in micro units (956066) as a percentage (95.6%). */
function rate(v) {
  return v != null ? `${(Number(v) / 10000).toFixed(1)}%` : '—';
}

/** A profile's win rate from its record: wins out of bounties entered. */
function winRate(rec) {
  const entered = Number(rec.competitions_entered) || 0;
  const won = Number(rec.competitions_won) || 0;
  if (entered <= 0) return '—';
  return `${Math.round((won / entered) * 100)}% (${won} of ${entered})`;
}

/** The best (lowest) placement among an account's entries, or null when it never placed. */
function bestPlacement(solutions) {
  const placed = (solutions || []).map((s) => Number(s.placement)).filter((n) => Number.isFinite(n) && n > 0);
  return placed.length ? Math.min(...placed) : null;
}

/** One leaderboard row: rank, entrant, entry, win rate, interval, size. */
function leaderRow(e) {
  const v = e.values || {};
  const avatar = e.image
    ? `<img class="avatar" crossorigin="anonymous" src="${esc(absUrl(e.image))}" alt="" loading="lazy" data-avatar>`
    : '';
  // The top three stand out: the eye lands on the leaders first.
  const top = e.rank != null && e.rank <= 3 ? ' class="top3"' : '';
  // The rank travels on the row, so keyboard navigation can find and
  // highlight one row at a time even as the window re-renders.
  return `
      <tr${top} data-rank="${e.rank ?? ''}">
        <td>${e.rank ?? '—'}</td>
        <td><a class="entrant" href="#/u/${encodeURIComponent(e.handle || '')}">${avatar}${esc(e.handle || '—')}</a></td>
        <td class="entry-title">${esc(e.title || '—')}</td>
        <td><strong>${rate(v.judge)}</strong></td>
        <td>${rate(v.judge_low)}–${rate(v.judge_high)}</td>
        <td>${v.bytes != null ? `${Math.round(Number(v.bytes) / 1024)} KB` : '—'}</td>
      </tr>`;
}

/** A bounty's leaderboard, virtualized: a scroll window renders only the
    rows on screen, so a 400-entry ranking never puts 400 rows in the DOM. */
export function leaderboardView(data, page, stale) {
  const entries = data.entries || [];
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(1, page || 1), pages);
  const comp = data.competition || {};
  const slug = comp.slug || '';
  const win = lbWindow(entries, (p - 1) * PAGE * LB_ROW_PX);
  const showing = total === 0
    ? '<p>No entries ranked yet.</p>'
    : `<p class="showing" id="lb-showing">Showing ${win.first + 1}–${win.last} of ${total} entries</p>`;
  return `${stale ? staleNote() : ''}
    <p><a href="#/bounty/${encodeURIComponent(slug)}">&larr; ${esc(comp.title || 'Bounty')}</a></p>
    <h1>Leaderboard: ${esc(comp.title || '')}</h1>
    <p class="sub">${total} ranked entries · judge win rate · ${esc((data.phase && data.phase.title) || '')}</p>
    ${showing}
    <form class="lb-jump" id="lb-jump" aria-label="Jump to a rank on the leaderboard">
      <label for="lb-jump-input">Jump to rank</label>
      <input type="number" id="lb-jump-input" min="1" max="${total}" placeholder="1–${total}" inputmode="numeric" aria-describedby="lb-jump-hint">
      <button type="submit">Go</button>
      <span class="lb-jump-hint" id="lb-jump-hint" role="status"></span>
    </form>
    <p class="lb-keys-hint">Keyboard: ↑ ↓ move one rank, PgUp PgDn move a page, Home / End jump to the ends, Enter opens the focused entrant.</p>
    <div class="table-wrap lb-viewport" id="lb-viewport" tabindex="0" role="region" aria-label="Leaderboard entries, scroll to see more">
      <table class="leaderboard lb-virtual">
        <thead><tr><th scope="col">#</th><th scope="col">Entrant</th><th scope="col">Entry</th><th scope="col">Win rate</th><th scope="col">Interval</th><th scope="col">Size</th></tr></thead>
        <tbody id="lb-body">${lbWindowRows(entries, win.first, win.last)}</tbody>
      </table>
    </div>
    <nav class="pager" aria-label="Leaderboard pages">
      <button type="button" id="lb-prev" ${p <= 1 ? 'disabled' : ''}>&larr; Prev</button>
      <span id="lb-page">Page ${p} of ${pages}</span>
      <button type="button" id="lb-next" ${p >= pages ? 'disabled' : ''}>Next &rarr;</button>
    </nav>`;
}

/** Keep a virtual leaderboard's window on the rows the reader can see:
    scrolling re-renders only the visible slice, and the pager buttons jump
    the viewport a page at a time. Call after the view is on the page. */
export function wireLeaderboard(data, page) {
  const entries = data.entries || [];
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const viewport = document.getElementById('lb-viewport');
  const body = document.getElementById('lb-body');
  const showing = document.getElementById('lb-showing');
  const pageLabel = document.getElementById('lb-page');
  const prev = document.getElementById('lb-prev');
  const next = document.getElementById('lb-next');
  if (!viewport || !body) return;
  // A page route lands the viewport on that page's rows.
  viewport.scrollTop = (Math.min(Math.max(1, page || 1), pages) - 1) * PAGE * LB_ROW_PX;
  let raf = 0;
  let current = { first: -1, last: -1 };
  function render() {
    raf = 0;
    const win = lbWindow(entries, viewport.scrollTop);
    if (win.first === current.first && win.last === current.last) return;
    current = win;
    body.innerHTML = lbWindowRows(entries, win.first, win.last);
    if (showing) showing.textContent = `Showing ${win.first + 1}–${win.last} of ${total} entries`;
    const p = Math.floor(viewport.scrollTop / (PAGE * LB_ROW_PX)) + 1;
    if (pageLabel) pageLabel.textContent = `Page ${Math.min(p, pages)} of ${pages}`;
    if (prev) prev.disabled = viewport.scrollTop <= 0;
    if (next) next.disabled = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
    paintFocus();
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(render);
  }
  viewport.addEventListener('scroll', schedule, { passive: true });
  if (prev) prev.addEventListener('click', () => { viewport.scrollTop = Math.max(0, viewport.scrollTop - PAGE * LB_ROW_PX); });
  if (next) next.addEventListener('click', () => { viewport.scrollTop = Math.min(viewport.scrollHeight, viewport.scrollTop + PAGE * LB_ROW_PX); });

  // Jump to a rank and keyboard navigation: the reader can type a rank to
  // land on it, or walk the ranking with the keyboard instead of scrolling.
  // The focused rank is a 1-based rank; 0 means no row has the focus yet.
  let focusedRank = 0;
  const jumpForm = document.getElementById('lb-jump');
  const jumpInput = document.getElementById('lb-jump-input');
  const jumpHint = document.getElementById('lb-jump-hint');
  // The row for a rank, when that rank is inside the window on screen.
  function rankRow(rank) {
    return body.querySelector(`tr[data-rank="${rank}"]`);
  }
  // Move the focus ring to the focused rank, clearing it from every other row.
  function paintFocus() {
    body.querySelectorAll('tr.focused').forEach((row) => row.classList.remove('focused'));
    if (focusedRank < 1) return;
    const row = rankRow(focusedRank);
    if (row) row.classList.add('focused');
  }
  // Land the viewport on a rank: clamp it, scroll it to the top of the
  // window, focus it, and say where the reader landed.
  function jumpToRank(rank) {
    const n = Math.min(Math.max(1, Math.floor(Number(rank) || 0)), total);
    if (!n) {
      if (jumpHint) jumpHint.textContent = `Type a rank between 1 and ${total}.`;
      return;
    }
    focusedRank = n;
    viewport.scrollTop = (n - 1) * LB_ROW_PX;
    if (jumpHint) jumpHint.textContent = `Rank ${n} of ${total}.`;
    if (jumpInput) jumpInput.value = String(n);
    render();
    paintFocus();
  }
  // One step from the focused rank, or from the top row on screen when
  // nothing has the focus yet.
  function stepFocus(delta) {
    const start = focusedRank < 1 ? Math.floor(viewport.scrollTop / LB_ROW_PX) + 1 : focusedRank;
    jumpToRank(start + delta);
  }
  // A whole page from the focused rank, in either direction.
  function pageFocus(delta) {
    const start = focusedRank < 1 ? Math.floor(viewport.scrollTop / LB_ROW_PX) + 1 : focusedRank;
    jumpToRank(start + delta * PAGE);
  }
  if (jumpForm) jumpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    jumpToRank(jumpInput ? jumpInput.value : 0);
  });
  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); stepFocus(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); stepFocus(-1); }
    else if (event.key === 'PageDown') { event.preventDefault(); pageFocus(1); }
    else if (event.key === 'PageUp') { event.preventDefault(); pageFocus(-1); }
    else if (event.key === 'Home') { event.preventDefault(); jumpToRank(1); }
    else if (event.key === 'End') { event.preventDefault(); jumpToRank(total); }
    else if (event.key === 'Enter' && focusedRank >= 1) {
      const row = rankRow(focusedRank);
      const link = row ? row.querySelector('a.entrant') : null;
      if (link) { event.preventDefault(); link.click(); }
    }
  });
  render();
}

/** One bounty: summary, live facts, rewards table, description and rules.
    Loaded after the first load, like the leaderboard and profile, so its
    bytes stay out of the first-load Totals line. */
export function bountyView(b, stale, updated) {
  const state = openState(b);
  return `${stale ? staleNote() : ''}
    <p><a href="#/">&larr; All bounties</a></p>
    <h1>${esc(b.title)}</h1>
    <p class="summary">${esc(b.summary)}</p>
    <div class="hero" role="group" aria-label="Reward, entry fee and time left">
      <span class="hero-pot"><span class="hero-label">Live pot</span><strong>${pot(b)}</strong></span>
      <span class="hero-fee"><span class="hero-label">Entry fee</span><strong>${b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free'}</strong></span>
      <span class="hero-left"><span class="hero-label">Time left</span><strong data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</strong></span>
    </div>
    ${updated ? `<p class="updated">Updated ${clock(updated)} UTC · ${b.submissionCount} ${b.submissionCount === 1 ? 'entry' : 'entries'} so far</p>` : ''}
    <dl class="facts">
      <dt>Live pot</dt><dd>${pot(b)}</dd>
      <dt>Entry fee</dt><dd>${b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free'}</dd>
      <dt>Deadline</dt><dd>${date(b.deadline)} (<span data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>)</dd>
      <dt>Status</dt><dd>${state.label}</dd>
      <dt>Entries</dt><dd>${b.submissionCount}</dd>
      <dt>Category</dt><dd>${esc(b.category || '—')}</dd>
      ${b.sponsor ? `<dt>Sponsor</dt><dd>${esc(b.sponsor.name)}</dd>` : ''}
    </dl>
    <p><a class="button" href="#/split/${encodeURIComponent(b.slug)}">Board beside this bounty &rarr;</a> <a class="button" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard &rarr;</a> <a class="button" href="https://make.fun/bounty/${encodeURIComponent(b.slug)}" rel="noopener">Open on make.fun &nearr;</a></p>
    <h2>Rewards</h2>
    ${rewardsTable(b)}
    <h2>About this bounty</h2>
    <div class="description">${md(b.description)}</div>
    ${b.rules ? `<h2>Rules</h2><div class="description">${md(b.rules)}</div>` : ''}`;
}

/** A bounty's detail as it appears beside the board: hero, facts, rewards, description.
    Loaded after the first load, like the bounty page, so its bytes stay out
    of the first-load Totals line. */
export function splitDetail(b, stale, updated) {
  const state = openState(b);
  return `${stale ? staleNote() : ''}
    <h1>${esc(b.title)}</h1>
    <p class="summary">${esc(b.summary)}</p>
    <div class="hero" role="group" aria-label="Reward, entry fee and time left">
      <span class="hero-pot"><span class="hero-label">Live pot</span><strong>${pot(b)}</strong></span>
      <span class="hero-fee"><span class="hero-label">Entry fee</span><strong>${b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free'}</strong></span>
      <span class="hero-left"><span class="hero-label">Time left</span><strong data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</strong></span>
    </div>
    ${updated ? `<p class="updated">Updated ${clock(updated)} UTC · ${b.submissionCount} ${b.submissionCount === 1 ? 'entry' : 'entries'} so far</p>` : ''}
    <dl class="facts">
      <dt>Deadline</dt><dd>${date(b.deadline)} (<span data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>)</dd>
      <dt>Status</dt><dd>${state.label}</dd>
      <dt>Category</dt><dd>${esc(b.category || '—')}</dd>
      ${b.sponsor ? `<dt>Sponsor</dt><dd>${esc(b.sponsor.name)}</dd>` : ''}
    </dl>
    <p><a class="button" href="#/bounty/${encodeURIComponent(b.slug)}">Full bounty page &rarr;</a> <a class="button" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard &rarr;</a></p>
    <h2>Rewards</h2>
    ${rewardsTable(b)}
    <h2>About this bounty</h2>
    <div class="description">${md(b.description)}</div>`;
}

/** Master-detail: the live board beside the selected bounty, side by side on wide screens, stacked on a phone. */
export function splitView(board, bounty, stale, updated) {
  const items = board.items.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const open = items.filter((b) => openState(b).open).length;
  const totalPot = items.reduce((sum, b) => sum + (Number(b.potUsd ?? b.rewardAmount) || 0), 0);
  return `${stale ? staleNote() : ''}
    <p><a href="#/">&larr; All bounties</a></p>
    <h1>Board beside bounty</h1>
    <p class="sub">${items.length} bounties · ${open} open for entries · ${money(totalPot)} in live pots</p>
    <div class="split">
      <div class="split-board" aria-label="Bounty board">
        <ul class="board compact">${boardList(items, '#/split', bounty.slug)}</ul>
      </div>
      <div class="split-detail" aria-label="Selected bounty">
        ${splitDetail(bounty, false, updated)}
      </div>
    </div>`;
}

/** Keyboard navigation for the split view's board: Up and Down move between
    bounties, Enter opens the focused one beside the board. The board links
    are already focusable, so the reader tabs to one and then walks the list
    without touching the mouse. Call after the split view is on the page. */
export function wireSplitKeys() {
  const list = document.querySelector('.split-board .board');
  if (!list) return;
  const links = () => Array.from(list.querySelectorAll('a.title'));
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    const items = links();
    if (!items.length) return;
    const current = document.activeElement;
    const index = items.indexOf(current);
    if (event.key === 'Enter') {
      if (index >= 0) { event.preventDefault(); items[index].click(); }
      return;
    }
    event.preventDefault();
    // From no focused link, Down starts at the first bounty and Up at the last.
    const from = index < 0 ? (event.key === 'ArrowDown' ? -1 : 0) : index;
    const next = event.key === 'ArrowDown'
      ? Math.min(items.length - 1, from + 1)
      : Math.max(0, from - 1);
    items[next].focus();
  });
}

/** One entry on a profile: title, bounty, placement, prize, date. */
function solutionRow(s) {
  const c = s.competition || {};
  return `
      <li>
        <a class="title" href="#/bounty/${encodeURIComponent(c.slug || '')}">${esc(s.title || c.title || '—')}</a>
        <span>${esc(c.title || '')}</span>
        <span>${s.placement ? `Placed #${s.placement}` : 'Entered'}</span>
        <span>${s.prize_usd ? money(s.prize_usd) : ''}</span>
        <span>${s.entered_at ? date(s.entered_at) : ''}</span>
      </li>`;
}

/** An account's public profile: picture, links, record and entries. */
export function profileView(p, stale) {
  const rec = p.record || {};
  const sols = (p.solutions || []).map(solutionRow).join('');
  const placed = (p.solutions || []).filter((s) => s.placement).length;
  const best = bestPlacement(p.solutions);
  const avatar = p.image
    ? `<img class="avatar-lg" crossorigin="anonymous" src="${esc(absUrl(p.image))}" alt="" data-avatar>`
    : '';
  return `${stale ? staleNote() : ''}
    <p><a href="#/">&larr; All bounties</a></p>
    <div class="profile">
      ${avatar}
      <div>
        <h1>${esc(p.display_name || p.handle)}</h1>
        <p class="handle">@${esc(p.handle)}</p>
        ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
        <p class="links">
          ${p.github_login ? `<a href="https://github.com/${encodeURIComponent(p.github_login)}" rel="noopener">GitHub</a>` : ''}
          ${p.x ? `<a href="https://x.com/${encodeURIComponent(p.x.username)}" rel="noopener">X</a>` : ''}
          ${p.wallet ? `<a href="${esc(p.wallet.explorer_url)}" rel="noopener">Wallet</a>` : ''}
        </p>
      </div>
    </div>
    <dl class="facts">
      <dt>Joined</dt><dd>${p.joined_at ? date(p.joined_at) : '—'}</dd>
      <dt>Bounties entered</dt><dd>${rec.competitions_entered ?? 0}</dd>
      <dt>Placed</dt><dd>${rec.competitions_placed ?? 0}${placed ? ` (${placed} shown below)` : ''}</dd>
      <dt>Best placement</dt><dd>${best != null ? `#${best}` : '—'}</dd>
      <dt>Won</dt><dd>${rec.competitions_won ?? 0}</dd>
      <dt>Win rate</dt><dd>${winRate(rec)}</dd>
      <dt>Prize money</dt><dd>${rec.prize_usd != null ? money(rec.prize_usd) : '$0'}</dd>
    </dl>
    <h2>Entries</h2>
    ${sols ? `<ul class="solutions">${sols}</ul>` : '<p>No entries yet.</p>'}`;
}
