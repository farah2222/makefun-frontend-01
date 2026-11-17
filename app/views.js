// The board and bounty pages: each a function from API data to HTML.

import { date, esc, md, money, openState, timeLeft } from './format.js';

/** The reward as it stands now: the prize plus any entry fees paid into it. */
const pot = (b) => money(b.potUsd ?? b.rewardAmount);

/** The entry fee, when the bounty charges one. */
const fee = (b) => (b.entryFeeUsd ? `${money(b.entryFeeUsd)} entry fee` : 'Free to enter');

/** A note shown when the page renders from a cached copy because the live API failed. */
export function staleNote() {
  return '<p class="notice" role="status">Live data is unreachable right now — showing the last cached copy.</p>';
}

/** An error page with a retry button (wired by main.js). */
export function errorView(err) {
  return `<h1>Could not load this page</h1><p>${esc(err.message || 'The make.fun API did not answer.')}</p><p><button id="retry" type="button">Try again</button></p>`;
}

/** One board row: title, live pot, entry fee, ticking time left, entries, open state. */
function boardRow(b) {
  const state = openState(b);
  return `
      <li class="${state.open ? 'open' : 'closed'}">
        <a class="title" href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a>
        <span class="pot">${pot(b)}</span>
        <span class="fee">${fee(b)}</span>
        <span class="left" data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>
        <span class="entries">${b.submissionCount} ${b.submissionCount === 1 ? 'entry' : 'entries'}</span>
        <span class="state">${state.label}</span>
      </li>`;
}

/** The board's rows only, so a filter can update the list without rebuilding the page. */
export function boardList(items) {
  return items.map(boardRow).join('');
}

/** The board: every open bounty, soonest deadline first, with filters. */
export function boardView(data, stale) {
  const items = data.items.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const open = items.filter((b) => openState(b).open).length;
  return `${stale ? staleNote() : ''}
    <h1>Open bounties</h1>
    <p class="sub">${items.length} bounties · ${open} open for entries · pots update live</p>
    <div class="filters" role="group" aria-label="Filter bounties">
      <button type="button" data-filter="all" aria-pressed="true">All</button>
      <button type="button" data-filter="open" aria-pressed="false">Open for entries</button>
      <button type="button" data-filter="closing" aria-pressed="false">Closing soon</button>
    </div>
    <ul class="board">${boardList(items)}</ul>`;
}

/** A bounty's rewards table: live amounts now, falling back to the base table. */
function rewardsTable(b) {
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

/** One bounty: summary, live facts, rewards table, description and rules. */
export function bountyView(b, stale) {
  const state = openState(b);
  return `${stale ? staleNote() : ''}
    <p><a href="#/">&larr; All bounties</a></p>
    <h1>${esc(b.title)}</h1>
    <p class="summary">${esc(b.summary)}</p>
    <dl class="facts">
      <dt>Live pot</dt><dd>${pot(b)}</dd>
      <dt>Entry fee</dt><dd>${b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free'}</dd>
      <dt>Deadline</dt><dd>${date(b.deadline)} (<span data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>)</dd>
      <dt>Status</dt><dd>${state.label}</dd>
      <dt>Entries</dt><dd>${b.submissionCount}</dd>
      <dt>Category</dt><dd>${esc(b.category || '—')}</dd>
      ${b.sponsor ? `<dt>Sponsor</dt><dd>${esc(b.sponsor.name)}</dd>` : ''}
    </dl>
    <p><a class="button" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard &rarr;</a> <a class="button" href="https://make.fun/bounty/${encodeURIComponent(b.slug)}">Open on make.fun &nearr;</a></p>
    <h2>Rewards</h2>
    ${rewardsTable(b)}
    <h2>About this bounty</h2>
    <div class="description">${md(b.description)}</div>
    ${b.rules ? `<h2>Rules</h2><div class="description">${md(b.rules)}</div>` : ''}`;
}
