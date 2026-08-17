---
name: scene-sweep-protocol
description: Load at the start of every sweep. Where the roster lives, the monitoring-first sweep protocol, node-search and suggestion rules, recheck cadence, alert routing, and the sweep report format.
---

# Scene radar — sweep protocol

## The shape of this job

This is a **monitoring loop first and a discovery loop second**, and that ordering is
load-bearing. Most sweeps, your job is to re-check bands you already know for a change
of state — did something wake up, did a date appear. Discovering new bands is the side
quest you run with leftover budget, not the main event.

Get through the due roster first. Every time.

## Where things live

**The board is the system of record.** It holds the roster, the shows, the source
registry, and the archive of past sweeps. A human curates it. You read it at the start
of every sweep and write your findings back to it at the end.

| What | Tool | Who owns it |
|---|---|---|
| The roster — who's watched, their tier | `bands_list` / `bands_get` | **Human.** You can suggest, never promote. |
| What you learned about a band | `bands_update` | You |
| A band you discovered via a scene edge | `bands_suggest` | You propose; human triages |
| Shows | `shows_list` / `shows_add` | You add; human triages |
| Where to look | `sources_list` / `sources_propose` | Human adopts; you propose and report reach |

**Memory (`/mnt/memory/scene/`) is your notebook, not your database.** The roster used
to live here as `_watchlist.md`; it does not any more. What memory is still for:

- **`_learnings.md`** — distilled sourcing lessons across sweeps. Which sources actually
  produce, which are permanently blind, which edge types have paid off, dead ends worth
  remembering. This is the highest-value thing you keep.
- **`<band-slug>.md`** — narrative research notes too long or too contingent for the
  band's one-line `signal` field: what you ruled out and why, the shape a future reunion
  would take, name collisions you had to work through.

Do not rebuild the roster, the frontier, or a dismissed list in memory. Those are board
state now, and a memory copy would silently drift out of date.

## Each sweep — run this in order

1. **Get today's date.** Run `date +%F`. You need it for recheck math and for judging
   what's upcoming versus past.

2. **Read the board first.**
   - `bands_list` with `due_only: true` — this is your work queue, already filtered to
     bands that are active and due. Work it in tier order, tier 1 first.
   - `bands_list` with `listed: "dismissed"` — bands the human rejected. **Never
     research or re-suggest these.**
   - `shows_list` with `when: "all"` — what's already reported, and what the human has
     already *decided* about. A show at any status other than `new` is settled; don't
     re-report it as a find. Note the `id` of anything you may need to supersede.
   - `sources_list` — the adopted registry. Tier 1 sources get checked every sweep;
     tier 2 when a band shows a live signal. **Anything still `proposed` is not yet a
     source** — don't rely on it, and don't re-propose it.

3. **Read `_learnings.md`** and apply it to this sweep's choices. If it says a source
   has been dry for two months, deprioritise it; if it says a promoter account is the
   only place local shows appear, check that first.

4. **Clean up past shows.** For any show whose date has passed and whose status is still
   `new`, call `shows_update` with `status: "missed"`. That's the only status write
   that's yours.

5. **Sweep the due roster — this is the main work.** For each due band, delegate to your
   **Band Mapper** sub-agent, several in parallel. Each delegation must carry: the band
   name, its tier, its `canonical_url` and the disambiguating era/region/genre, its
   current known state, any `lineup_qualifier`, and the relevant adopted sources. The
   mapper sees none of your context and cannot look any of it up — omitting the
   disambiguators is how a sweep ends up researching the wrong band.

   When each mapper returns:
   - **Check identity first.** If it reports `identity: "ambiguous"`, or its sources
     describe a band from the wrong era, country, or genre, record that via
     `bands_update` and report nothing else for that band this sweep.
   - Sanity-check anything that looks off. You own judgment; the mapper is research
     help. **Spot-verify a CONFIRMED date's URL yourself** — fetch it and confirm it
     says what the mapper claims — before it reaches the board.
   - **Check any lineup qualifier.** A show that fails one is reported but is not
     break-glass; a show whose lineup is unstated is SIGNAL, not CONFIRMED.
   - Call **`bands_update`** for **every** band you checked, including the ones where
     you found nothing. `last_checked` is how the roster knows the work happened; a band
     you researched but didn't update will come back as due tomorrow.
   - Set `no_surface: true` for a band with no socials, Bandcamp or website at all. For
     those, the "dormant account suddenly posts" signal can never fire — say so, push
     their cadence out, and watch the label, members' current bands, and festival bills
     instead.
   - Push qualifying shows with `shows_add` (rules below).

6. **Node search — only with budget left over.** Use `bands_suggest` for bands you found
   through a **hard edge**: shared member, split release, same label, tourmates, same
   comp, same scene-and-era. Name the specific connection — the person, the split, the
   comp with its catalogue number.

   **"Sounds like" is not an edge** and must never be used. Suggestions land untiered and
   unswept, so they cost nothing until the human promotes one; re-suggesting a band
   already on the roster is a harmless no-op, and a dismissed band is never resurrected.

   Prefer edges reaching *outward*. Ten more bands from the same six people is an echo,
   not coverage.

7. **Report on sources.** Call `sources_update` for any adopted source you used: whether
   you could reach it, and whether it produced anything. A source that has been dry for
   months should be reported as such — that's how the registry earns its budget. Use
   `sources_propose` for new candidates, being honest in `reach` about whether you
   actually loaded the page.

8. **Write memory last** — `_learnings.md`, and any band notes worth keeping.

9. **Report** (format below).

## Recheck cadence

Sweep budget is finite and most of the roster is dormant most of the time. Set `recheck`
via `bands_update` so budget goes where movement is:

| Band status | Recheck |
|---|---|
| `touring` / `active` | weekly |
| `stirring` (signs of life, no dates) | weekly — the highest-value state |
| `dormant`, quiet < 6 months of sweeps | monthly |
| `dormant`, quiet > 6 months, or `defunct` | quarterly |
| `no_surface: true` | monthly at most — nothing can change online |

Tier 1 bands never go below monthly regardless of status. A 25-year-dormant band
announcing a show is exactly the case this project exists for.

## Alert routing

Two speeds, because a 60-cap reunion can sell out in a day:

- **Break-glass — lead the report with it:** any CONFIRMED show for a **tier 1** band
  anywhere; any CONFIRMED in-range show whose tickets go on sale within 7 days; any
  reunion, final show, or first-dates-in-years announcement at any tier. A show that
  fails a lineup qualifier, or whose lineup is unstated, is **never** break-glass.
- **Digest — normal report:** everything else.

When something is break-glass, say why it's time-critical and what the deadline is. A
deadline the human misses is the same as not reporting it.

## Pushing shows

Use `shows_add` for every show that passes the taste profile's ring rules for its tier.
Pass everything you have; `sources` is required.

- **Push SIGNAL entries too**, with `date: null` and `confidence: "SIGNAL"`. A credible
  rumour about a tier-1 band is worth seeing. What you must never do is dress one up as
  CONFIRMED — the board rejects a CONFIRMED entry with no date or no source, and that
  rejection is a correctly-working guardrail, not an obstacle to route around.
- **Do NOT push** out-of-range shows, anything on the taste profile's "does NOT count"
  list, or a band the human has dismissed.
- **When a SIGNAL firms up**, re-push with the real date and `replaces: "<old id>"`.
  Without it you get two rows for one show.
- **Never set `status`** on a show you're adding. That's the human's decision.

A push failing is information — report the error verbatim rather than retrying with
weakened claims.

## Verification

Read your **`show-verification`** skill and follow it exactly for every claim. The
CONFIRMED/SIGNAL split, the identity requirement, and the block formats are defined
there, and they are not optional.

## Sweep report format

1. **Break-glass first**, or the words "Nothing urgent."
2. **Tally:** "Checked N of M due bands. X CONFIRMED shows (Y net-new). Z status
   changes. S bands suggested."
3. **New CONFIRMED shows** — band, date, venue, city, tier, why it matters, ticket link
   and on-sale date, source URL. Soonest first.
4. **SIGNAL** — clearly separated, each with what would upgrade it.
5. **Status changes** — bands that moved between dormant/stirring/active, and why.
6. **Suggested bands** — each with its specific edge. Say what the edge *is*.
7. **Coverage gaps** — bands you couldn't check and why, bands whose identity you
   couldn't establish, and sources you couldn't reach. Mandatory: write "Full coverage
   this sweep" rather than omitting it.
8. **What you wrote** — bands updated, shows pushed, sources proposed or reported on.
