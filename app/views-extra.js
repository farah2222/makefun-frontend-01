// The leaderboard and profile pages, loaded after the first load:
// main.js imports this module only when a route needs it, so its bytes
// stay out of the first-load Totals line.

import { date, esc, money } from './format.js';
import { staleNote } from './views.js';

/** Rows per leaderboard page: 404 entries paginate, they never render at once. */
const PAGE = 20;

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

/** One leaderboard row: rank, entrant, entry, win rate, interval, size. */
function leaderRow(e) {
  const v = e.values || {};
  const avatar = e.image
    ? `<img class="avatar" crossorigin="anonymous" src="${esc(absUrl(e.image))}" alt="" loading="lazy" data-avatar>`
    : '';
  return `
      <tr>
        <td>${e.rank ?? '—'}</td>
        <td><a class="entrant" href="#/u/${encodeURIComponent(e.handle || '')}">${avatar}${esc(e.handle || '—')}</a></td>
        <td>${esc(e.title || '—')}</td>
        <td><strong>${rate(v.judge)}</strong></td>
        <td>${rate(v.judge_low)}–${rate(v.judge_high)}</td>
        <td>${v.bytes != null ? `${Math.round(Number(v.bytes) / 1024)} KB` : '—'}</td>
      </tr>`;
}

/** A bounty's leaderboard, paginated: the judge win rate, 20 entries a page. */
export function leaderboardView(data, page, stale) {
  const entries = data.entries || [];
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const p = Math.min(Math.max(1, page || 1), pages);
  const start = (p - 1) * PAGE;
  const rows = entries.slice(start, start + PAGE).map(leaderRow).join('');
  const comp = data.competition || {};
  const slug = comp.slug || '';
  // Which slice of the ranking this page shows, so a reader never wonders
  // where they are in a 400-entry table.
  const showing = total === 0
    ? '<p>No entries ranked yet.</p>'
    : `<p class="showing">Showing ${start + 1}–${Math.min(start + PAGE, total)} of ${total} entries</p>`;
  return `${stale ? staleNote() : ''}
    <p><a href="#/bounty/${encodeURIComponent(slug)}">&larr; ${esc(comp.title || 'Bounty')}</a></p>
    <h1>Leaderboard: ${esc(comp.title || '')}</h1>
    <p class="sub">${total} ranked entries · judge win rate · ${esc((data.phase && data.phase.title) || '')}</p>
    ${showing}
    <div class="table-wrap"><table class="leaderboard">
      <thead><tr><th scope="col">#</th><th scope="col">Entrant</th><th scope="col">Entry</th><th scope="col">Win rate</th><th scope="col">Interval</th><th scope="col">Size</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <nav class="pager" aria-label="Leaderboard pages">
      ${p > 1 ? `<a href="#/bounty/${encodeURIComponent(slug)}/leaderboard/${p - 1}">&larr; Prev</a>` : '<span aria-hidden="true">Prev</span>'}
      <span>Page ${p} of ${pages}</span>
      ${p < pages ? `<a href="#/bounty/${encodeURIComponent(slug)}/leaderboard/${p + 1}">Next &rarr;</a>` : '<span aria-hidden="true">Next</span>'}
    </nav>`;
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
      <dt>Placed</dt><dd>${rec.competitions_placed ?? 0}</dd>
      <dt>Won</dt><dd>${rec.competitions_won ?? 0}</dd>
      <dt>Win rate</dt><dd>${winRate(rec)}</dd>
      <dt>Prize money</dt><dd>${rec.prize_usd != null ? money(rec.prize_usd) : '$0'}</dd>
    </dl>
    <h2>Entries</h2>
    ${sols ? `<ul class="solutions">${sols}</ul>` : '<p>No entries yet.</p>'}`;
}
