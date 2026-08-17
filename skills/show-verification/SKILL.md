---
name: show-verification
description: Load before reporting any show, date, or tour claim. The two-tier confidence contract (CONFIRMED vs SIGNAL), what counts as a primary source, and the machine-readable block format for shows and bands.
---

# Show verification — the confidence contract

A fabricated tour date costs a three-hour drive to an empty bar. That is a worse
outcome than missing a show entirely, so the bar for a date claim is high and
the failure mode you must avoid is confident wrongness, not incompleteness.

Every claim you report carries exactly one of two labels.

## CONFIRMED

Requires a **primary source URL** you actually fetched, which states the date. Primary
means one of:

- The venue's own calendar, event page, or dated post.
- The band's own post, page, or Bandcamp/label announcement.
- A ticketing link for the specific show (the ticket page, not a search result).
- The promoter's own announcement, when the promoter is in the source registry.

A CONFIRMED entry must carry: band, date, venue, city, and the URL. If you cannot
produce all five, it is not CONFIRMED — downgrade it.

It must also be the **right band** — see below.

## Identity comes before everything else

Several watchlist names are generic and shared by unrelated acts across different
decades, countries, and genres. **Reporting the wrong band's show costs exactly what a
fabricated show costs** — a wasted trip — so identity is a precondition, not a detail.

Before reporting anything for a band:

- Match it against the era, region, and genre in the taste profile.
- Record a **canonical identifier** — a Discogs artist URL or Bandcamp page — on the
  band's memory card, and reuse it on later sweeps instead of re-deriving identity from
  a name search.
- If a source is about a band with the same name but the wrong era, country, or genre,
  it is not evidence about your band. Discard it and say so.

If you cannot confidently establish identity, **report nothing for that band** and say
"couldn't disambiguate" with what you found. That is a useful result a human resolves in
one sentence. A confident report about the wrong band is not recoverable.

## Lineup qualifiers

Some bands only count with specific members — the taste profile lists them. A show that
fails a qualifier is not a hit: report it, state plainly that the qualifier isn't met,
and do not route it as break-glass.

When an announcement doesn't name the lineup, that's `SIGNAL`, not `CONFIRMED` — say the
lineup is unconfirmed rather than assuming the one you'd like.

## SIGNAL

Everything else, and it must be labeled as such in plain language every time you
mention it. SIGNAL covers:

- Chatter, forum posts, secondhand mentions, "I heard they're playing…".
- A poster or flyer image with no corroborating listing.
- A lineup that lists the band but with no date or venue yet.
- Reactivated socials, a new release, a label signing — signs a tour *might* follow.
- Anything you inferred rather than read.

SIGNAL entries say what would upgrade them: "venue calendar not yet posted — recheck
in a week."

## Never do these

- Never state a date you did not read on a page. Do not reconstruct one from
  "they usually tour in spring" or from a partial flyer.
- Never present a SIGNAL as a date. If the confidence label and the prose disagree,
  the prose is the bug.
- Never invent a venue name, a promoter, or a URL. If a source registry entry turns out
  not to exist or not to be checkable, say so — that is a finding about the registry.
- Never upgrade a claim because it seems likely. Likelihood is not a source.

## Say what you couldn't see

Distinguish these three outcomes explicitly. Collapsing them is the most damaging thing
you can do, because it makes an unreliable sweep look like a quiet week:

1. **Checked, nothing found** — you reached the sources and there is no news.
2. **Could not check** — the source is login-walled, down, or otherwise unreachable.
3. **No source exists** — you have no way to see this band's activity at all.

## Machine-readable blocks

Emit these alongside your prose so downstream tooling can parse the sweep. Fenced,
one JSON object per fence, exactly these keys.

### A show

````
```show
{
  "band": "<band name>",
  "date": "2026-09-14",
  "venue": "<venue name>",
  "city": "<City, ST>",
  "confidence": "CONFIRMED",
  "tier": 1,
  "in_range": true,
  "lineup_ok": true,
  "why_now": "<first dates since the 2019 breakup>",
  "tickets_url": "<url or null>",
  "on_sale": "2026-08-20",
  "sources": ["<url>"]
}
```
````

- `date` is `yyyy-mm-dd`. If only a month is known, the entry is SIGNAL, not CONFIRMED,
  and `date` is `null` with the month named in `why_now`.
- `confidence` is exactly `"CONFIRMED"` or `"SIGNAL"`.
- `tier` is 1, 2, or 3 from the taste profile, or `null` for a band not yet on the
  watchlist.
- `on_sale` is the ticket on-sale date when known — it is often the real deadline.
- `lineup_ok` is `true` when the band has no lineup qualifier or the announcement meets
  it, `false` when it plainly fails, and `null` when the lineup is unstated. `null` or
  `false` means the entry is not break-glass, whatever its tier.

### A band card update

````
```band
{
  "band": "<band name>",
  "canonical_url": "<discogs or bandcamp artist page>",
  "identity": "confirmed",
  "status": "active",
  "last_checked": "2026-08-12",
  "signal": "released first LP in 25 years on <label>, no dates announced",
  "sources": ["<url>"],
  "recheck": "weekly"
}
```
````

- `canonical_url` is the identifier that survives across sweeps. Once set, later sweeps
  start from it rather than re-deriving identity from a name search.
- `identity` is `confirmed` or `ambiguous`. While it is `ambiguous`, no show for this
  band may be reported at any confidence level.
- `status` is one of `dormant`, `stirring`, `active`, `touring`, `defunct`.
  `stirring` means signs of life without dates — the state worth watching hardest.
- `recheck` is `weekly`, `monthly`, or `quarterly`. Push long-dormant bands out to
  quarterly so sweep budget goes where the movement is.

### A discovered node

````
```node
{
  "band": "<band name>",
  "edge": "shared member",
  "edge_detail": "<person> played in both, 1997–2001",
  "connects_to": "<watchlist band it connects to>",
  "active": true,
  "sources": ["<url>"]
}
```
````

`edge` must be one of: `shared member`, `split release`, `same label`, `tourmates`,
`same comp`, `same scene`. **"Sounds similar" is not an edge** and must never be
recorded as one — if that's all you have, don't emit the node.
