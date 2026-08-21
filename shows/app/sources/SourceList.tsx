"use client";

import { useMemo, useState } from "react";
import { SOURCE_KINDS, type Source, type SourceStatus } from "@/lib/sources";

const REACH_LABEL: Record<string, string> = {
  fetched: "fetched ok",
  "login-walled": "login wall",
  dead: "dead",
  unverified: "not opened",
};

export function SourceList({ initial, readOnly = false }: { initial: Source[]; readOnly?: boolean }) {
  const [sources, setSources] = useState(initial);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");

  const filtered = useMemo(() => {
    let out = sources;
    if (kind !== "all") out = out.filter((s) => s.kind === kind);
    if (q.trim()) {
      const n = q.toLowerCase();
      out = out.filter((s) => [s.name, s.region, s.notes].some((f) => f?.toLowerCase().includes(n)));
    }
    return out;
  }, [sources, q, kind]);

  const proposed = filtered.filter((s) => s.status === "proposed");
  const adopted = filtered.filter((s) => s.status === "adopted");
  const rejected = filtered.filter((s) => s.status === "rejected");

  async function patch(id: string, fields: Partial<Source>) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));
    const res = await fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const updated = await res.json();
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } else setSources(initial);
  }

  return (
    <>
      <div className="toolbar">
        <div className="filters">
          <button className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>all</button>
          {SOURCE_KINDS.map((k) => (
            <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}s</button>
          ))}
        </div>
        <input className="search" placeholder="name, region…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {proposed.length > 0 && (
        <>
          <hr className="rule" />
          <h2 className="section">Awaiting your ruling <span className="count">{proposed.length}</span></h2>
          <p className="section-note">
            The radar proposed these. They are <strong>not</strong> used in sweeps until adopted —
            a hallucinated venue is a hallucinated show, so nothing becomes a source on the agent&rsquo;s say-so.
          </p>
          <div className="cards">
            {proposed.map((s) => (
              <div className="card" key={s.id}>
                <span className={`stamp ${s.reach === "fetched" ? "t2" : "tnone"}`}>
                  {s.reach === "fetched" ? "OK" : "?"}
                </span>
                <h3>{s.name}</h3>
                <div className="meta">{s.kind} · {s.region ?? "region unknown"}</div>
                {s.url && (
                  <div className="mono-sm" style={{ marginTop: 4, wordBreak: "break-all" }}>
                    <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
                  </div>
                )}
                <div className="sig">
                  <span className={`tag ${s.reach === "fetched" ? "" : "warn"}`}>
                    {REACH_LABEL[s.reach ?? "unverified"]}
                  </span>
                  {s.where_posted && <span className="tag">{s.where_posted}</span>}
                  {s.notes && <div style={{ marginTop: 5 }}>{s.notes}</div>}
                </div>
                <div className="foot">
                  <div className="filters">
                    {!readOnly && <button onClick={() => patch(s.id, { status: "adopted", tier: 1 })}>adopt · every sweep</button>}
                    {!readOnly && <button onClick={() => patch(s.id, { status: "adopted", tier: 2 })}>adopt · on signal</button>}
                  </div>
                  {!readOnly && <button className="danger" onClick={() => patch(s.id, { status: "rejected" })}>reject</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <hr className="rule" />
      <h2 className="section">In rotation <span className="count">{adopted.length}</span></h2>
      <p className="section-note">
        Tier 1 gets checked every sweep. Tier 2 only when a band shows a live signal.
      </p>

      {adopted.length === 0 ? (
        <div className="empty">
          <strong>No sources adopted</strong>
          Coverage here is the reach of the whole project — without sources, a sweep can only report that it couldn&rsquo;t see anything.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 70 }}>When</th>
              <th>Source</th>
              <th>Reach</th>
              <th style={{ width: 60 }}>Finds</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {adopted.map((s) => (
              <tr key={s.id}>
                <td>
                  {readOnly ? (
                    <span>{(s.tier ?? 2) === 1 ? "every" : "on signal"}</span>
                  ) : (
                    <select value={s.tier ?? 2} onChange={(e) => patch(s.id, { tier: Number(e.target.value) as 1 | 2 })}>
                      <option value={1}>every</option>
                      <option value={2}>on signal</option>
                    </select>
                  )}
                </td>
                <td>
                  <strong>{s.name}</strong>
                  <span className="tag">{s.kind}</span>
                  <div className="mono-sm">
                    {s.region ?? "—"}
                    {s.where_posted ? ` · ${s.where_posted}` : ""}
                    {s.url && (
                      <> · <a href={s.url} target="_blank" rel="noreferrer">open</a></>
                    )}
                  </div>
                  {s.notes && <div className="mono-sm" style={{ marginTop: 3 }}>{s.notes}</div>}
                </td>
                <td>
                  <span className={`tag ${s.reach === "fetched" ? "" : "warn"}`}>
                    {REACH_LABEL[s.reach ?? "unverified"]}
                  </span>
                  {s.reach_notes && <div className="mono-sm">{s.reach_notes}</div>}
                </td>
                <td style={{ textAlign: "center", fontWeight: 700 }}>{s.produced_finds ?? 0}</td>
                <td>{!readOnly && <button className="danger" onClick={() => patch(s.id, { status: "rejected" })}>drop</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rejected.length > 0 && (
        <>
          <hr className="rule" />
          <h2 className="section">Ruled out <span className="count">{rejected.length}</span></h2>
          <p className="section-note">
            Kept deliberately: the radar reads this so it can&rsquo;t re-propose a venue that closed years ago.
          </p>
          <table>
            <tbody>
              {rejected.map((s) => (
                <tr key={s.id} className="past">
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td className="mono-sm">{s.notes ?? s.reach_notes ?? "—"}</td>
                  <td style={{ width: 100 }}>
                    {!readOnly && <button onClick={() => patch(s.id, { status: "adopted", tier: 2 })}>restore</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
