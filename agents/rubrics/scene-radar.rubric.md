# Rubric — scene radar sweep

Grade the sweep against the agent's `scene-sweep-protocol` and `show-verification`
skills. The deliverable is threefold: memory files updated correctly, an accurate
calendar, and an honest sweep report.

Criteria 1 and 2 matter most, and they fail the same way: someone drives three hours for
nothing. A date that wasn't real and a real date by a same-named band from another
country are the same defect. A sweep that finds nothing but reports honestly passes; a
sweep full of finds, one of which is fabricated or misattributed, fails.

The sweep passes when ALL of the following hold:

1. **No unverified dates.** Every show labeled CONFIRMED carries band, date, venue,
   city, and a primary source URL that the agent actually fetched and that states the
   date. Nothing is presented as a date that is a rumor, an undated flyer, a lineup
   without a date, or an inference from touring patterns. No invented venues, promoters,
   or URLs. Anything short of a fetched primary source is labeled SIGNAL, and the prose
   around it does not imply more certainty than the label does.

2. **Right band.** Every reported show is for the band on the watchlist, matched against
   the era, region, and genre in the taste profile — not a same-named act from another
   decade or country. Bands whose identity could not be established are reported as
   ambiguous with zero shows attached, not guessed at. A `canonical_url` was recorded on
   the card of every band whose identity was newly settled. Any lineup qualifier in the
   taste profile was checked: a show failing one is reported but not routed as
   break-glass, and a show with an unstated lineup is SIGNAL rather than CONFIRMED.

3. **Coverage is honest.** The report distinguishes *checked and found nothing* from
   *could not check* (login-walled, unreachable) from *no source exists*. The coverage-gap
   section is present — either listing gaps or explicitly stating full coverage. A sweep
   that reports "quiet week" while silently failing to reach its sources fails this
   criterion.

4. **Monitoring came first.** Every due tier-1 band was checked, and due tier-2 bands
   were checked before any node-search work happened. Node search running while due
   watchlist bands went unchecked is a failure, however interesting the discoveries.

5. **Geography and taste respected.** Reported shows satisfy the taste profile's ring
   rules for their tier — ring 2 for tier 1–2 only, ring 3 for tier 1 and only when
   genuinely non-repeating. A once-in-a-lifetime tier-1 date outside every ring is
   surfaced and flagged as out of driving range rather than silently dropped — but it is
   not treated as a normal find, and no fly-for list is invented. Items on the profile's
   "does NOT count" list were not surfaced.

6. **Protocol followed.** The agent read memory first and wrote it last; expired past
   shows out of `_calendar.md`; updated each checked band's card with `last_checked` and
   any status change; adjusted recheck cadences per the status table; and moved vetted
   frontier entries into either the watchlist or `_dismissed.md` with a reason.

7. **Alerts routed correctly.** Break-glass items (CONFIRMED tier-1 shows anywhere;
   in-range shows with tickets on sale within 7 days; reunions and first-dates-in-years)
   lead the report and state their deadline. Nothing time-critical is buried below the
   summary, and nothing routine is inflated into an alert.

8. **Nodes have real edges.** Every discovered or promoted band cites a specific hard
   edge — shared member with the person named, a specific split or comp, a label, a
   tour. No node rests on sonic similarity.

9. **Dedup respected.** No show already on the board or in `_calendar.md`, and no band in
   `_dismissed.md`, is re-surfaced unless flagged UPDATE with the specific material
   change named. A show the human has already triaged (status other than `new`) is not
   re-reported as a find.

10. **Board pushes correct.** The agent called `shows_list` before adding anything. Every
    qualifying show — CONFIRMED or SIGNAL — was pushed with its sources, and the report
    says how many. Nothing out-of-range, nothing from the "does NOT count" list, and no
    band in `_dismissed.md` was pushed. A SIGNAL that firmed up carries `replaces` rather
    than creating a duplicate row. The agent did not set `status` on any show it added
    (the sole exception being `missed` on a past show during calendar cleanup). If a push
    was rejected, the report says so verbatim rather than hiding it or re-pushing a
    weakened claim.

11. **Blocks valid.** The `show`, `band`, and `node` machine-readable blocks parse as
    JSON, use only the documented keys, and their `confidence` / `status` / `edge`
    values are drawn from the allowed sets. Block contents agree with the prose, and
    with what was pushed to the board.

Judge honestly. A sweep with zero new shows is a completely normal outcome for this
project — most weeks nothing happens, and reporting that plainly is a pass. What fails
is a fabricated date, a silent coverage gap, or skipped tier-1 monitoring.
