// Small helpers for showing API values.

/** Text made safe to put inside HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A dollar amount ('1000.00' or 0.5) as '$1,000' or '$0.50'; '—' when there is none. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}

/** A deadline as a date in UTC. */
export function date(iso) {
  return `${new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
}

/** The time until a deadline: '2d 4h left', '35m left', or 'ended'. */
export function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return 'less than a minute left';
}

/** Whether a bounty still takes entries: by its deadline, not its status alone. */
export function openState(b) {
  const ms = new Date(b.deadline).getTime() - Date.now();
  if (ms > 0) return { open: true, label: 'Open for entries' };
  return { open: false, label: 'Entries closed' };
}

/** Text folded for search: lowercase, trimmed, runs of space collapsed. */
export function norm(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A time of day as 'HH:MM:SS' in UTC, for a "data updated at" note. */
export function clock(when) {
  if (!when) return '—';
  return new Date(when).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' });
}

/** A small markdown subset (headings, bullet lists, bold, links) as HTML. */
export function md(text) {
  const lines = String(text ?? '').split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${inline(trimmed.slice(4))}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${inline(trimmed.slice(3))}</h2>`;
    } else if (trimmed.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${inline(trimmed.slice(2))}</h2>`;
    } else if (trimmed.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(trimmed.slice(2))}</li>`;
    } else if (trimmed === '') {
      if (inList) { html += '</ul>'; inList = false; }
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${inline(trimmed)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

/** Inline markdown: links, then bold, on text already made safe. */
function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
