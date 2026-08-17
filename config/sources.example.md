# Source registry

The premise of this project is that these shows are *beneath* the aggregators. General
web search mostly won't find them either — the announcement lives on a venue's Instagram
or a promoter's story, not on a site Google indexes well.

So the agent gets a hand-maintained list of places that actually produce signal. This
file is injected into the radar's system prompt. Coverage here matters more than any
prompt cleverness.

> ⚠️ **This file is a schema plus a bootstrap task, not a finished list.** Run
> `npm run sweep -- --bootstrap` to have the agent research and propose venues,
> promoters, and listers for your range; then confirm what's real and paste it in.
> Don't let the agent maintain this file unattended — a hallucinated venue is a
> hallucinated show.

## How the agent should use this

- Check every **tier-1 source** on every sweep. These are the ones that reliably carry
  the small stuff.
- Check **tier-2 sources** when a watchlist band has a live signal (new release,
  reactivated socials) suggesting dates might be coming.
- Record in `_learnings.md` which sources have actually produced a real find, and which
  have produced nothing over many sweeps. Promote and demote accordingly, and say so in
  the sweep report.

## Venues — Ring 1 first, then Ring 2–3

Order this by the rings in `config/taste.md`, and make sure the ring definitions match.
A registry centred on the wrong region systematically misses Ring 1 — which is both the
best-covered and shortest-drive territory, so it is the most expensive thing to get
wrong.

Small rooms matter more than big ones here. A 900-cap venue's calendar is already on
every aggregator; a 60-cap bar's calendar is the whole point of this project.

| Venue | City | Where dates get posted | Tier | Notes |
|---|---|---|---|---|
| _(awaiting bootstrap — run `npm run sweep -- --bootstrap`)_ | | | | |

## Promoters / booking collectives

The single highest-value category, and the one general search is worst at. A regional
DIY promoter often announces a show weeks before any venue calendar or ticketing site
reflects it.

| Promoter | Region | Where they post | Tier | Notes |
|---|---|---|---|---|
| _(bootstrap)_ | | | | |

## Band-level sources

Checked per watchlist band rather than globally:

- The band's own Bandcamp page — new releases, and often tour dates in the description.
- The band's socials, if any. Note that "no posts in four years, then a post" is itself
  the signal, independent of content.
- Their label's roster page and announcements.
- Discogs artist page — for lineup, splits, and label edges (this is scene-graph
  research, not date research).

## Regional listers / calendars

| Source | Coverage | Tier | Notes |
|---|---|---|---|
| _(bootstrap)_ | | | |

## Standing negative findings

**Record every dead end here, permanently.** The failure mode this prevents: a bootstrap
proposes the obvious, famous, all-ages club for your region — and it closed years ago.
It sounds exactly right, which is why it survives review, and it will be re-proposed on
every future bootstrap unless the negative finding is written down.

Format each as the claim, the correction, and a source:

- **⛔ Do not add <venue> (<city>).** <Why it's wrong — closed in <year>, wrong region,
  duplicate of <other entry>.> Source: <url>

## Known blind spots

Be explicit about these in sweep reports rather than silently missing them — an agent
that reports "no news" when it simply cannot see the source is worse than one that says
it's blind.

- **Instagram** — most small-venue and promoter announcements live here, and it is
  largely inaccessible without login. Where a venue cross-posts to a website or
  Facebook page, prefer that. Otherwise flag the gap.
- **Facebook events** — same problem, and often the only place a DIY show exists.
- **Private Discords and group chats** — invisible to the agent by design.
- **Word of mouth / flyers** — the original source of truth for this scene and
  permanently out of reach.

If a sweep's answer for a band is "no signal", the report must say *which sources were
actually checkable*, so the difference between "nothing happened" and "I couldn't see"
stays visible.
