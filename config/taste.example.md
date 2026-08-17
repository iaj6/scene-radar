# Taste profile — <your name>

This file is the equivalent of an ICP. It is injected into every sweep's system prompt,
so it is the single source of truth for *what counts as a hit*. Edit it, run
`npm run update`, and the agent's judgment moves with it.

**Home base: <city, state>.**

> **Fill this in before your first sweep.** A vague taste profile produces a firehose of
> shows you don't care about, and the agent has no other way to learn what you mean.
> Every `<placeholder>` below is yours to replace; the section structure is what the
> sweep protocol and the grading rubric expect, so keep the headings.

## Tiers

The tier decides how far you'll travel and how urgently you need to know — not whether
something gets reported.

Keep these in sync with `config/roster.json`, which is the machine-readable copy the
board is seeded from.

### Tier 1 — drop everything
Broken up or effectively dormant. Any date is a genuine event, worth reorganizing a
weekend around. A show here is the whole reason the project exists.

Record a **canonical URL** (Discogs or Bandcamp) for every tier-1 band. Once it is set,
sweeps start from it instead of re-deriving identity from a name search — which is where
wrong-band errors come from.

- **<band>** — <genre>, <region>. <Why it's dormant, and what would have to change.>
  <Any known live signal, or explicitly "no live signal".>
  → <discogs or bandcamp URL>

### Tier 2 — would drive for it
Bands that do surface occasionally. Worth a real drive on a weeknight.

- **<band>** — <one line: region, and why it's tier 2 rather than 1 or 3>

### Tier 3 — curious
Small regional bands where the value is mostly proximity: if it's close, you want to
know. Also where node-search discoveries land before you promote or dismiss them.

- **<band>** — <one line>

### Bands with no online surface

List any band here that has **no socials, no Bandcamp, no website** — usually because it
ended before social media. The highest-value signal in this project ("a dormant account
suddenly posts") *cannot fire* for them, so the agent watches their labels, their
members' current bands, and festival bills instead, and caps their recheck at monthly.
Mark the same bands `"no_surface": true` in `config/roster.json`.

## Geography

Not a radius. Effort scales with how irreplaceable the show is, so range is a function
of tier. Give rough drive times from your home base — they calibrate the agent better
than state names alone.

### Ring 1 — anything on the list, any tier
**<states>.** <City ~Nh, City ~Nh.>
This is the core. Everything here gets reported regardless of tier.

### Ring 2 — tier 1 and 2
**<states>.** <City ~Nh, City ~Nh.> Note *where* in each state is realistic — "NY" is
not one place, and a state named without qualification will be read as all of it.

### Ring 3 — tier 1 only, and only if it won't come around again
**<cities or regions>.** <~Nh.>

Give the agent a **calibration sentence** for this ring — one concrete example of a band
and a city that would clear the bar. The bar is roughly: *a band that is genuinely gone,
playing the only date you could reach.* A routine tour that happens to stop there is not
that. One vivid example teaches this better than a paragraph of rules.

### Flying
**Decide this explicitly, and say so either way.** If there is no fly-for list, write
that there is none and tell the agent not to invent one — then say what to do with a
genuinely once-in-a-lifetime find outside every ring. The useful default: surface it,
say plainly that it's out of driving range, and leave the call to you. Don't let it be
filtered out silently, and don't let it be treated as a normal find.

## Lineup qualifiers

Some reunions don't count without specific people. When a band below has a qualifier, a
show that doesn't meet it is **not a hit** — report it, but say explicitly that the
qualifier isn't met, and don't route it as break-glass.

| Band | Qualifier |
|---|---|
| <band> | <person> on <instrument>. Without them it's a different band. |

If a lineup can't be determined from the announcement, that's a `SIGNAL`, not a
`CONFIRMED` hit — say the lineup is unconfirmed rather than assuming.

## Identity — read this before researching any band

**Generic band names are the main source of expensive errors.** Reporting a show by the
wrong band is exactly as costly as fabricating one — you still drive somewhere for
nothing.

List here any name on your roster that is **shared by unrelated acts** across eras,
countries, or genres. Short, common words are the usual offenders.

So: before reporting anything for a band, confirm you have the right one, and record a
canonical identifier (Discogs artist URL or Bandcamp page) on its memory card. Match on
era, region, and genre as given above. If identity can't be confidently established, say
so and report nothing for that band — an honest "couldn't disambiguate" is a useful
result you can resolve in a sentence.

### Known false positives

Record every wrong match that has already cost a research pass, so it is never
re-derived. These are permanent negative findings, and they are as valuable as the
positive ones.

- <aggregator> "<name>" resolves to <unrelated act> — not our band.

## The two questions that decide everything

Before any other rule, ask these in order:

1. **Is it in range** for its tier, per the rings above?
2. **Is it the kind of thing that won't come around again** — a reunion, a one-off, a
   curated event, first dates in years, a band seen once in a room not yet seen?

**If both are yes, report it. That answer overrides every exclusion below**, including
the aggregator rule. A show being easy to find is not a reason to hide it — missing a
genuine one-off because it happened to be on a ticketing site is a far worse outcome
than being told about something already seen.

If either is no, then work through the exclusions.

## What counts as news

Ranked by how much you care:

1. A **date** — any confirmed show, in range per the rings above.
2. **Signs of life** — a dormant band reactivating: new label signing, socials waking up
   after years quiet, members hinting at a reunion, a lineup announcement they're on.
3. A **release** — new record, reissue, or discography comp, *specifically* because it
   often precedes touring.
4. A **new node** — a band not on the watchlist that connects to one that is by a hard
   edge (shared member, split, label, scene), and is currently active.

## What does NOT count

These only apply once the two questions above have failed.

- **Routine touring.** Bands that never stopped and play the same rooms every year. This
  is the real exclusion, and it's about the band's *mode*, not about where the listing
  appears.
- **Aggregator presence is NOT an exclusion.** Being on Bandsintown / Songkick /
  Ticketmaster / AXS never suppresses a show on its own. Treat it only as weak evidence
  that a band may be in routine-touring mode — and even then, check the band's actual
  pattern rather than inferring from the listing. A one-off by a band that otherwise
  doesn't play is a hit whether or not it has a ticket link. Never withhold a find on the
  assumption it was already seen elsewhere.
- Festival lineup rumors with no primary source.
- Merch drops, anniversary posts, "on this day" nostalgia content.
- Tribute bands, cover sets, and DJ appearances by members.
- A reunion that fails a lineup qualifier, routed as if it passed.

## Genre / scene context

<Era and genres — be specific about years. "Late-90s metallic hardcore" tells the agent
more than "hardcore".>

**Name the geographic cluster your roster actually sits in**, if it has one. A roster
assembled from one scene usually has a centre of gravity, and naming it tells the agent
which regional sources to weight. Getting this wrong is expensive in the other
direction: a registry built around the wrong region systematically misses your Ring 1.

For the scene graph, say which **edges** actually pay off for your roster. Shared members
are usually the strongest in DIY — one roster fans out across a dozen projects — followed
by label and splits/comps. "Sounds similar" is explicitly **not** an edge.
