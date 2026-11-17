// The board and bounty pages: each a function from API data to HTML.

import { clock, date, esc, md, money, openState, timeLeft } from './format.js';

/** The reward as it stands now: the prize plus any entry fees paid into it. */
export const pot = (b) => money(b.potUsd ?? b.rewardAmount);

/** The entry fee, when the bounty charges one. */
export const fee = (b) => (b.entryFeeUsd ? `${money(b.entryFeeUsd)} entry fee` : 'Free to enter');

/** A note shown when the page renders from a cached copy because the live API failed. */
export function staleNote() {
  return '<p class="notice" role="status">Live data is unreachable right now — showing the last cached copy.</p>';
}

/** An error page with a retry button (wired by main.js). */
export function errorView(err) {
  return `<h1>Could not load this page</h1><p>${esc(err.message || 'The make.fun API did not answer.')}</p><p><button id="retry" type="button">Try again</button></p>`;
}

/** One board row: title, live pot, entry fee, ticking time left, entries, open state. */
function boardRow(b, base, selected) {
  const state = openState(b);
  const current = b.slug === selected ? ' aria-current="true"' : '';
  return `
      <li class="${state.open ? 'open' : 'closed'}${b.slug === selected ? ' selected' : ''}">
        <span class="cell-title"><a class="title" href="${base}/${encodeURIComponent(b.slug)}"${current}>${esc(b.title)}</a>${b.category ? `<span class="category">${esc(b.category)}</span>` : ''}</span>
        <span class="pot">${pot(b)}</span>
        <span class="fee">${fee(b)}</span>
        <span class="left" data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>
        <span class="entries">${b.submissionCount} ${b.submissionCount === 1 ? 'entry' : 'entries'}</span>
        <span class="state">${state.label}</span>
      </li>`;
}

/** The board's rows only, so a filter can update the list without rebuilding the page. */
export function boardList(items, base = '#/bounty', selected = '') {
  return items.map((b) => boardRow(b, base, selected)).join('');
}

/** The board: every open bounty, with search, sort and filters over the data held. */
export function boardView(data, stale, updated) {
  const items = data.items.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const open = items.filter((b) => openState(b).open).length;
  // The pots together, at a glance: each bounty's live pot added up.
  const totalPot = items.reduce((sum, b) => sum + (Number(b.potUsd ?? b.rewardAmount) || 0), 0);
  return `${stale ? staleNote() : ''}
    <h1>Open bounties</h1>
    <p class="sub"><span id="board-count">${items.length} bounties</span> · ${open} open for entries · ${money(totalPot)} in live pots${updated ? ` · updated ${clock(updated)} UTC` : ''}</p>
    <div class="board-tools">
      <input type="search" id="board-search" placeholder="Search bounties…" aria-label="Search bounties by title, category or slug" autocomplete="off">
      <label class="sort">Sort
        <select id="board-sort" aria-label="Sort bounties">
          <option value="deadline" selected>Soonest deadline</option>
          <option value="pot">Biggest pot</option>
          <option value="entries">Most entries</option>
        </select>
      </label>
    </div>
    <div class="filters" role="group" aria-label="Filter bounties">
      <button type="button" data-filter="all" aria-pressed="true">All</button>
      <button type="button" data-filter="open" aria-pressed="false">Open for entries</button>
      <button type="button" data-filter="closing" aria-pressed="false">Closing soon</button>
    </div>
    <ul class="board">${boardList(items)}</ul>
    <p class="empty" id="board-empty" hidden>No bounties match your search.</p>`;
}

/** A bounty's rewards table: live amounts now, falling back to the base table. */
export function rewardsTable(b) {
  const rows = (b.rewardsNow && b.rewardsNow.length
    ? b.rewardsNow
    : Object.entries(b.rewards || {}).map(([place, amount]) => ({ place: Number(place), baseUsd: amount, feeShareUsd: null, amountUsd: amount }))
  ).map((r) => `
      <tr><td>${r.place}</td><td>${r.baseUsd != null ? money(r.baseUsd) : '—'}</td><td>${r.feeShareUsd != null ? money(r.feeShareUsd) : '—'}</td><td><strong>${money(r.amountUsd)}</strong></td></tr>`).join('');
  return `<div class="table-wrap"><table class="rewards">
      <thead><tr><th scope="col">Place</th><th scope="col">Prize</th><th scope="col">Fee share</th><th scope="col">Total now</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
