# Health

A row a day, written by `.github/workflows/health.yml`. Nothing here is
generated for its own sake — these are the numbers that drift quietly and are
expensive to notice late: how much JavaScript a phone has to download, how many
tests stand behind a change, and how far the dependencies have fallen behind.

One row per date is also one commit per day, which is what keeps the
contribution graph green. That is deliberate and it is the honest version: each
of those commits carries a measurement actually taken that day, so the history
still means something to whoever reads it later.

`Green` is the test suite. A bundle of `?` means the production build failed
that day — the snapshot is taken anyway, because a broken main is exactly the
day the record is worth having.

Read the columns as trends, not as targets.

| Date | Tests | Files | Green | Bundle | Largest chunk | Outdated deps |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-04 | 632 | 41 | ✅ | 1533 KB | 665 KB | 25 |
| 2026-08-05 | 632 | 41 | ✅ | 1533 KB | 665 KB | 26 |
| 2026-08-06 | 632 | 41 | ✅ | 1533 KB | 665 KB | 26 |
| 2026-08-07 | 632 | 41 | ✅ | 1533 KB | 665 KB | 26 |
| 2026-08-08 | 632 | 41 | ✅ | 1533 KB | 665 KB | 26 |
| 2026-08-09 | 632 | 41 | ✅ | 1533 KB | 665 KB | 26 |
