# scene-radar

A Managed Agent that tracks a roster of small, mostly-dormant bands and tells you when
they play — the reunions, one-offs, and short runs that never reach Bandsintown or
Songkick because the band is too small and the room holds sixty people.

Built on Anthropic **Managed Agents**: a coordinator agent with a memory store, a
locked sub-agent for parallel research, graded outcomes against a rubric, and procedure
carried in skills rather than prompts.

## The two things that make this different from a normal show tracker

**Monitoring first, discovery second.** Most trackers are discovery engines. This one
is mostly a re-check loop: the roster is dormant, and the job is noticing the week it
stops being dormant. Node search — "you liked this band, here's an adjacent one that's
active" — runs on leftover budget, not before the watchlist.

**A fabricated date costs a three-hour drive.** So every claim carries a confidence
label: `CONFIRMED` needs a primary source URL the agent actually fetched, everything
else is `SIGNAL` and says so. The rubric fails a sweep that blurs the two — or that
reports a quiet week when it simply couldn't reach its sources.

## The node search

Not collaborative filtering — these bands have no data density, which is exactly why
the algorithms fail you. Instead a **scene graph** built from hard, citable edges:

- shared members (by far the strongest edge in DIY — one roster fans out across a dozen
  projects)
- split releases and comp appearances
- label (a late-90s roster is a better recommender than any algorithm)
- tourmates, same scene, same era

Discogs and Bandcamp expose most of this as structured data. "Sounds similar" is
explicitly **not** an edge and never enters the frontier.

## Setup

```
! export ANTHROPIC_API_KEY=sk-ant-...     # or: ant auth login
npm install
```

```
npm run init-config     # creates config/ from the committed templates
```

**Fill in `config/taste.md` first.** It's the ICP equivalent — tiers, geography rings,
what counts as news — and it ships as `<placeholders>`. A vague taste profile produces a
firehose of shows you don't care about. `config/roster.json` is its structured half: the
band list, tiers, and lineup qualifiers. Everything in `config/` is gitignored except the
templates, so your instance stays yours — see `config/README.md`. Then:

```
npm run setup           # environment + memory store + mapper agent + radar coordinator
npm run setup-skills    # uploads skills/ and attaches them
```

Deploy the board (see below), then point the agent at it:

```
BOARD_URL=https://<your-board>.vercel.app MCP_TOKEN=<token> npm run setup-mcp
npm run sweep -- --bootstrap
```

The bootstrap sweep seeds memory from the taste profile, checks the tier-1 bands, and
**proposes** venues and promoters for `config/sources.md` — you confirm them before
they become sources. A hallucinated venue is a hallucinated show.

The board is optional for a first run: without `setup-mcp` the radar still sweeps and
reports, it just has nowhere to put the results but `sweeps/`.

## The board (`shows/`)

A Next.js app that is both the thing you look at and the agent's database — Vercel Blob
for storage, an MCP server at `/api/mcp` the radar calls, HTTP Basic Auth for you.
Xerox-flyer themed, because it should be fun to open.

Four surfaces:

| Page | What it is | Who owns what |
|---|---|---|
| **Bands** | The roster of record. Tier, status, cadence, identity. | You own tier + list membership; the agent owns research. |
| **Shows** | Dates found, with confidence and break-glass. | You own triage status; the agent owns the find. |
| **Sources** | Where the radar looks. | You adopt; the agent proposes and reports reach. |
| **Sweeps** | Every run, with the grader's verdict and full report. | Read-only history. |

**The roster moved here from the memory store.** `_watchlist.md` was agent-writable and
human-hostile — you couldn't curate it. Now `bands_list` is the first call of every
sweep, and the tiers you set are binding. Memory is the agent's notebook again:
`_learnings.md` plus per-band narrative notes, and explicitly *not* a second copy of
the roster.

**Discovered bands land as suggestions.** When the radar finds an adjacent band through
a hard scene edge it calls `bands_suggest`; the band appears on the roster untiered and
**unswept**, so suggesting costs nothing. Giving it a tier promotes it; dismissing it is
permanent — the dismissed list is kept precisely so the radar can't rediscover the same
dead end every week.

```
cd shows
npm install
cp .env.example .env.local     # MCP_TOKEN, INGEST_TOKEN, BOARD_PASSWORD, PUBLIC_VIEW
npx vercel --prod              # attach a Blob store in the Vercel dashboard
```

**What it holds.** One row per show, sorted into months. Each carries its confidence
badge, tier, why-now, ticket link, on-sale date, and sources. An **Act now** panel at the
top surfaces the break-glass set — tier 1 anywhere, or tickets on sale within 7 days —
because those are the ones where seeing it a week late is the same as missing it.

**Publishing it read-only.** Set `PUBLIC_VIEW=1` and the board serves anonymous
visitors a read-only view: everything the radar researched — roster, tiers, dates,
sources, sweep reports — with `status` and `notes` stripped **server-side**, before the
data reaches the page. Hiding a field in JSX is not enough; server components serialize
their props into the RSC payload, so a merely-hidden field is still in the page source.
Writes stay behind Basic Auth, the agent and ingest bearers are untouched, and the mode
is off unless the variable is exactly `1`. Log in and you get the full board back.

One thing that does *not* happen: shows are never hidden by status. Dropping the ones
you're attending would leak more than it hides — absence is a signal, and a row missing
from an otherwise-complete board says "he's going to that one" to anyone diffing it
against a venue calendar. Stripping the field tells a visitor nothing; removing the row
tells them something.

**The status field is yours.** `new → interested → going → tickets`, or `passed` /
`missed`. A sweep re-pushing the same show refreshes the researched fields and never
resets your decision — that separation is enforced in the store (`EDITABLE`) rather than
trusted to the prompt. The agent's only legitimate status write is marking a past show
`missed` during calendar cleanup.

**Dedup.** A show's id is `band + venue + year-month`, so a SIGNAL that firms up into a
date within the same month updates in place. When a date slides across a month boundary,
the agent passes `replaces: <old id>` — the stale row is deleted and your triage status
carries over.

**The MCP tools are allowlisted**: `shows_list`, `shows_get`, `shows_add`,
`shows_update`. Deliberately no delete — retiring a show is your call. Two guardrails
sit at the door rather than only in the prompt: `shows_add` rejects a CONFIRMED entry
with no date or no source URL, and `shows_update` accepts exactly one status (`missed`),
so an agent cannot decide you're going to something.

## Running

```
npm run sweep                  # weekly sweep
npm run sweep -- "<mission>"   # ad-hoc, still graded
npm run update                 # push prompt / taste / source-registry edits
```

Reports land in `sweeps/`. After editing `config/taste.md` or `config/sources.md`,
run `npm run update` — they're baked into the system prompt at push time, so edits
don't take effect until you do.

Skills are different: agents reference `version: "latest"`, so editing
`skills/<name>/` and re-running `setup-skills` changes behavior without an agent
version bump.

## How the pieces fit

```
Scene Radar (coordinator, graded)
 ├─ the board over MCP  ← system of record
 │    bands_list/get/update/suggest · shows_list/get/add/update
 │    sources_list/propose/update
 ├─ memory /mnt/memory/scene/   notebook: _learnings.md + band notes
 ├─ taste + sources (config/)   baked into the system prompt
 ├─ skills: scene-sweep-protocol, show-verification
 └─ Band Mapper (sub-agent, research tools only)
       one thread per due band, in parallel → typed band_report JSON
```

`bands_list` is the first call of every sweep. The board says who's watched, what you've
already decided, and where to look; memory says what the agent has learned about doing
the job. The agent gets 11 tools and, deliberately, no way to set a tier, a show status
(beyond `missed`), or adopt a source.

The mapper is deliberately starved: no memory, no skills, no taste profile. It
researches one band from the brief it's handed and returns raw findings. All judgment —
verifying CONFIRMED dates, memory writes, alert routing, the report — stays with the
coordinator.

### Memory layout

Deliberately small now that the board holds the structured state:

| File | What it holds |
|---|---|
| `_learnings.md` | which sources actually produce, which are permanently blind, which edge types pay off |
| `<band>.md` | narrative research notes too long or contingent for a band's one-line `signal` |

The roster, calendar, frontier and dismissed list all used to live here and don't any
more. A memory copy of board state would silently drift, so the protocol forbids it.

Recheck cadence tracks status: `stirring` (signs of life, no dates) gets checked weekly
because it's the highest-value state; long-dormant bands drop to quarterly; bands with
no online surface at all cap at monthly, since nothing about them can change online.
Tier 1 never goes below monthly.

## Not built yet

- **The weekly cron** — a scheduled deployment. The sweep is graded and idempotent, so
  this is mostly a scheduling question.
- **The break-glass push** — the board surfaces urgent shows when you look at it, and
  the protocol routes them to the top of the report, but nothing pushes *to you*. A
  tier-1 announcement shouldn't wait for you to open a tab. Email via Resend is the
  cheap version; the BD system's digest agent is the template.
- **An eval suite** — the BD system's offline harness over fixed tasks. Most valuable
  here as a regression check that the verification contract holds after prompt edits.

## Files

- `config/` — **everything that's yours**, gitignored but for the templates:
  `taste.md` (the source of judgment — edit this first), `sources.md` (the prompt-baked
  registry, kept for geography notes and standing negative findings; the board's Sources
  page supersedes it for adoption), and `roster.json` (bands, tiers, qualifiers)
- `agents/*.system.md` — the two agent prompts
- `agents/rubrics/` — the grading rubric for a sweep
- `skills/` — the sweep protocol and the verification contract
- `shows/` — the board: Next.js UI + MCP server + Blob store
- `shows/proxy.ts` — the auth doors: agent bearer, ingest bearer, Basic Auth, public view
- `shows/lib/viewer.ts` — who's looking, and what gets redacted before it reaches them
- `src/setup.ts` — one-time provisioning
- `src/setup-mcp.ts` — vault credential + wires the radar to the board
- `src/sweep.ts` — the session runner
- `src/init-config.ts` — creates `config/` from the committed templates
- `src/seed-board.ts` — replays completed sweeps' typed blocks into the board
- `src/lib/taste.ts` — composes taste + sources + prompt on every agent push

## License

MIT — see `LICENSE`.
