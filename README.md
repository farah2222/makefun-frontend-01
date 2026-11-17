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
| `#/bounty/<slug>/leaderboard` | Leaderboard: judge win rate, paginated 20 a page | `GET /api/competitions/{slug}/leaderboard` |
| `#/u/<handle>` | Public profile: picture, links, record, entries | `GET /api/profiles/{handle}` |

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
  blank page.
- **Access.** Semantic HTML, labelled navigation, focus-visible outlines,
  `aria-pressed` filter buttons, a phone layout.

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
