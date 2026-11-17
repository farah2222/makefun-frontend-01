# make.fun frontend

A fully working web client for make.fun, made of static files: no build step,
no framework. It reads make.fun's public API alone and shows the live bounty
board, a bounty's page, its leaderboard and an account's public profile, each
reachable by a link and by its own URL.

## Run it

```sh
node serve.ts        # serves app/ on http://localhost:8080
```

## Surfaces

| Route | Surface | API |
| --- | --- | --- |
| `#/` | Bounty board: live pot, entry fee, time left, entries, open state | `GET /api/competitions?status=open&activity=times` |
| `#/bounty/<slug>` | Bounty page: summary, live facts, rewards table, description, rules | `GET /api/competitions/{slug}` |
| `#/split/<slug>` | Board beside bounty: the live board on the left, the selected bounty beside it | `GET /api/competitions?status=open&activity=times` + `GET /api/competitions/{slug}` |
| `#/bounty/<slug>/leaderboard` | Leaderboard: judge win rate, virtualized scroll window, top three highlighted | `GET /api/competitions/{slug}/leaderboard` |
| `#/u/<handle>` | Public profile: picture, links, record, best placement, entries | `GET /api/profiles/{handle}` |

## Board: search, sort, filters

The board works on the data it already holds — searching, sorting and
filtering never make a new request. Type in the search box to narrow rows by
title, category or slug; sort by soonest deadline, biggest pot or most
entries; filter by All, Open for entries or Closing soon. The count line
says how many rows match ("3 of 7 bounties") and an empty state appears
when nothing matches.

## Notes

- **Open state by deadline, not status alone.** A bounty past its deadline
  may still read `status: open` until results are published; the board marks
  it "Entries closed" from its deadline.
- **ETag cache.** API answers are revalidated with `If-None-Match`; an answer
  inside the same minute comes back 304. Paging a leaderboard reuses the data
  already held, so no new request is made.
- **Live countdowns.** Time-left values tick every 30 seconds without
  rebuilding the page.
- **Small first load.** The leaderboard and profile views load only when a
  route needs them, through a literal `import()`, so their bytes stay out of
  the first-load Totals line.
- **Graceful failure.** When the API is unreachable the page renders the last
  cached copy with a note, or a clear error with a retry button — never a
  blank page. A hung API gives up after 15 s (`AbortSignal.timeout`) so the
  fallback can happen at all.
- **Board at a glance.** Each row shows its category under the title, and the
  board header adds up every live pot. A search box and a sort control work
  on the data already held, and the count line says how many rows match.
- **Bounty headline.** The bounty page opens with a hero strip — live pot,
  entry fee and ticking time left, too big to miss — and notes when the data
  was last updated.
- **Board beside bounty.** `#/split/<slug>` puts the live board on the left
  and the selected bounty beside it (stacked on a phone, bounty first).
  Picking a row in the board loads that bounty beside it.
- **Leaderboard position.** The leaderboard is virtualized: a scroll window
  renders only the rows on screen, so a 400-entry ranking never puts 400
  rows in the DOM; each page says which slice it shows
  ("Showing 1–20 of 404 entries"); the top three rows stand out; a profile
  shows its win rate from its record and its best placement.
- **Markdown links.** Bounty descriptions render `###` headings and
  `[text](url)` links, not just bold and bullets.
- **Access.** Semantic HTML, labelled navigation, focus-visible outlines,
  `aria-pressed` filter buttons, a phone layout, a skip link that appears on
  keyboard focus, focus moved to the new page on every route change, a
  `noscript` note, and tappable controls at least 44 px tall on phones.

## Screenshots

```sh
node shots.mjs       # serves app/ and captures screenshots/ on live data
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

## License

MIT — see `LICENSE`.
