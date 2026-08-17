"use client";

import { Fragment, useMemo, useState } from "react";
import { STATUSES, type Show, type Status } from "@/lib/store";

type When = "upcoming" | "past" | "all";

const today = () => new Date().toISOString().slice(0, 10);

// Date-only parsing: `new Date("2026-09-14")` is UTC midnight, which renders as the
// previous day west of Greenwich. Build the date in local time instead.
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MONTH = (iso: string) =>
  localDate(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });

function daysUntil(iso: string): number {
  const ms = localDate(iso).getTime() - localDate(today()).getTime();
  return Math.round(ms / 86_400_000);
}

export function Board({ initial }: { initial: Show[] }) {
  const [shows, setShows] = useState(initial);
  const [when, setWhen] = useState<When>("upcoming");
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const t = today();
  const upcoming = (s: Show) => s.date === null || s.date >= t;

  const visible = useMemo(() => {
    let out = shows;
    if (when === "upcoming") out = out.filter(upcoming);
    else if (when === "past") out = out.filter((s) => !upcoming(s));
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((s) =>
        [s.band, s.venue, s.city].some((f) => f?.toLowerCase().includes(needle)),
      );
    }
    return out;
  }, [shows, when, q, t]);

  // Break-glass, mirroring isUrgent() in the store: tier 1 anywhere, or tickets on sale
  // within a week. These are the ones where seeing it late is the same as missing it.
  const urgent = useMemo(
    () =>
      shows.filter(
        (s) =>
          upcoming(s) &&
          s.confidence === "CONFIRMED" &&
          s.status === "new" &&
          s.lineup_ok !== false &&
          s.lineup_ok !== null &&
          (s.tier === 1 || (s.on_sale && s.on_sale >= t && daysUntil(s.on_sale) <= 7)),
      ),
    [shows, t],
  );

  async function setStatus(id: string, status: Status) {
    setShows((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    const res = await fetch(`/api/shows/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setSaved(id);
      setTimeout(() => setSaved((cur) => (cur === id ? null : cur)), 1500);
    } else {
      // Roll back the optimistic update rather than showing a status that didn't persist.
      setShows(initial);
    }
  }

  // Group by month so the list reads like a calendar. Undated SIGNAL entries collect
  // at the end under their own heading — they're real leads, just not plannable yet.
  const groups: { label: string; rows: Show[] }[] = [];
  for (const s of visible) {
    const label = s.date ? MONTH(s.date) : "No date yet";
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(s);
    else groups.push({ label, rows: [s] });
  }

  return (
    <>
      {urgent.length > 0 && when === "upcoming" && (
        <div className="alarm">
          <h2>Act Now</h2>
          <ul>
            {urgent.map((s) => (
              <li key={s.id}>
                <b>{s.band}</b> — {s.venue}, {s.city}
                {s.date && <> · {localDate(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>}
                {s.on_sale && s.on_sale >= t && (
                  <>
                    {" "}
                    · <span className="deadline">
                      tickets {daysUntil(s.on_sale) === 0 ? "on sale today" : `on sale in ${daysUntil(s.on_sale)}d`}
                    </span>
                  </>
                )}
                {s.tier === 1 && !s.on_sale && <> · <span className="deadline">tier 1</span></>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="toolbar">
        <div className="filters">
          {(["upcoming", "past", "all"] as When[]).map((w) => (
            <button key={w} className={when === w ? "on" : ""} onClick={() => setWhen(w)}>
              {w}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder="band, venue, city…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <p className="empty">
          {shows.length === 0
            ? "Nothing on the board yet. Run a sweep."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who / where</th>
              <th>Why</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.label}>
                <tr className="group-row">
                  <td colSpan={5}>
                    <span>{g.label}</span>
                    <span className="count">{g.rows.length}</span>
                  </td>
                </tr>
                {g.rows.map((s) => (
                  <tr key={s.id} className={upcoming(s) ? "" : "past"}>
                    <td className="when">
                      {s.date ? (
                        <>
                          <span className="day">
                            {localDate(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          <span className="dow">
                            {localDate(s.date).toLocaleDateString(undefined, { weekday: "short" })}
                          </span>
                        </>
                      ) : (
                        <span className="tbd">TBD</span>
                      )}
                      {s.on_sale && s.on_sale >= t && (
                        <div className={`onsale${daysUntil(s.on_sale) <= 7 ? " soon" : ""}`}>
                          on sale {localDate(s.on_sale).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="band">
                        {s.band}
                        {s.tier && <span className={`tier t${s.tier}`}>T{s.tier}</span>}
                      </div>
                      <div className="where">
                        {s.venue} · {s.city}
                        {s.in_range === false && <> · <span className="muted">out of range</span></>}
                        {s.lineup_ok === false && <> · <span className="muted">lineup doesn&rsquo;t qualify</span></>}
                        {s.lineup_ok === null && <> · <span className="muted">lineup unconfirmed</span></>}
                      </div>
                    </td>
                    <td className="why">
                      <span className={`badge ${s.confidence}`}>{s.confidence}</span>
                      {s.why_now && <div style={{ marginTop: 5 }}>{s.why_now}</div>}
                    </td>
                    <td className="sources">
                      {s.tickets_url && (
                        <a href={s.tickets_url} target="_blank" rel="noreferrer">
                          tickets
                        </a>
                      )}
                      {(s.sources ?? []).slice(0, 2).map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer">
                          src{i + 1}
                        </a>
                      ))}
                    </td>
                    <td>
                      <select
                        data-status={s.status}
                        value={s.status}
                        onChange={(e) => setStatus(s.id, e.target.value as Status)}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      {saved === s.id && <span className="saved">saved</span>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
