"use client";

import { useMemo, useState } from "react";
import {
  BAND_STATUSES, RECHECKS, isDue, daysSinceChecked,
  type Band, type Tier, type Listed,
} from "@/lib/bands";

const TIER_LABEL: Record<string, string> = { "1": "T1", "2": "T2", "3": "T3" };

function tierClass(t: Tier | null) {
  return t === 1 ? "t1" : t === 2 ? "t2" : t === 3 ? "t3" : "tnone";
}

export function Roster({ initial, readOnly = false }: { initial: Band[]; readOnly?: boolean }) {
  const [bands, setBands] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    let out = bands;
    if (!showDismissed) out = out.filter((b) => b.listed !== "dismissed");
    if (q.trim()) {
      const n = q.toLowerCase();
      out = out.filter((b) =>
        [b.name, b.region, b.signal].some((f) => f?.toLowerCase().includes(n)),
      );
    }
    return out;
  }, [bands, q, showDismissed]);

  const suggested = filtered.filter((b) => b.listed === "suggested");
  const roster = filtered.filter((b) => b.listed === "active" || b.listed === "paused");
  const dismissed = filtered.filter((b) => b.listed === "dismissed");

  async function patch(slug: string, fields: Partial<Band>) {
    setBands((prev) => prev.map((b) => (b.slug === slug ? { ...b, ...fields } : b)));
    const res = await fetch(`/api/bands/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const updated = await res.json();
      setBands((prev) => prev.map((b) => (b.slug === slug ? updated : b)));
    } else {
      setBands(initial); // roll back rather than show state that didn't persist
    }
  }

  async function remove(slug: string) {
    setBands((prev) => prev.filter((b) => b.slug !== slug));
    setOpen(null);
    await fetch(`/api/bands/${slug}`, { method: "DELETE" });
  }

  async function create(name: string, tier: Tier) {
    const res = await fetch("/api/bands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, tier, listed: "active" }),
    });
    if (res.ok) {
      const b = await res.json();
      setBands((prev) => [...prev.filter((x) => x.slug !== b.slug), b]);
      setAdding(false);
    }
  }

  const openBand = bands.find((b) => b.slug === open) ?? null;

  return (
    <>
      <div className="toolbar">
        <div className="filters">
          <button className={showDismissed ? "on" : ""} onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? "hiding nothing" : `show dismissed (${bands.filter((b) => b.listed === "dismissed").length})`}
          </button>
          {!readOnly && <button onClick={() => setAdding(true)}>+ add band</button>}
        </div>
        <input className="search" placeholder="band, region, signal…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {adding && <AddBand onCancel={() => setAdding(false)} onCreate={create} />}

      {/* Suggestions first: this is the queue that needs you, and it's the whole
          point of letting the radar add to the roster. */}
      {suggested.length > 0 && (
        <>
          <hr className="rule" />
          <h2 className="section">
            Suggested by the radar <span className="count">{suggested.length}</span>
          </h2>
          <p className="section-note">
            Found through a scene edge. Not swept until you give one a tier — suggesting costs nothing.
          </p>
          <div className="cards">
            {suggested.map((b) => (
              <SuggestionCard key={b.slug} band={b} onPatch={patch} onOpen={() => setOpen(b.slug)} readOnly={readOnly} />
            ))}
          </div>
        </>
      )}

      <hr className="rule" />
      <h2 className="section">
        Watchlist <span className="count">{roster.length}</span>
      </h2>
      <p className="section-note">
        Tier sets how far you&rsquo;ll travel and how loudly it alarms. Only <em>active</em> bands are swept.
      </p>

      {roster.length === 0 ? (
        <div className="empty">
          <strong>No bands yet</strong>
          Add one, or run a sweep and let the radar suggest some.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 52 }}>Tier</th>
              <th>Band</th>
              <th>Status</th>
              <th>Checked</th>
              <th style={{ width: 96 }}>Cadence</th>
              <th style={{ width: 90 }}>On list</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((b) => (
              <tr key={b.slug} className={b.listed === "paused" ? "past" : ""}>
                <td>
                  {readOnly ? (
                    <span className={`tier t${b.tier ?? ""}`}>
                      {b.tier ? TIER_LABEL[String(b.tier)] : "—"}
                    </span>
                  ) : (
                    <select
                      value={b.tier ?? ""}
                      onChange={(e) => patch(b.slug, { tier: Number(e.target.value) as Tier })}
                      aria-label={`Tier for ${b.name}`}
                    >
                      {[1, 2, 3].map((t) => (
                        <option key={t} value={t}>{TIER_LABEL[String(t)]}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <a
                    onClick={() => setOpen(b.slug)}
                    style={{ cursor: "pointer", fontWeight: 700 }}
                  >
                    {b.name}
                  </a>
                  {b.identity === "ambiguous" && <span className="tag warn">identity unresolved</span>}
                  {b.no_surface && <span className="tag">no online surface</span>}
                  {b.lineup_qualifier && <span className="tag warn">lineup: {b.lineup_qualifier}</span>}
                  <div className="mono-sm">{b.region ?? "—"}{b.signal ? ` · ${b.signal}` : ""}</div>
                </td>
                <td style={{ textTransform: "uppercase", fontSize: 11.5 }}>
                  {b.band_status ?? "unknown"}
                  {b.band_status === "stirring" && <div className="tag warn">watch closely</div>}
                </td>
                <td className="mono-sm">
                  {b.last_checked ?? <span className="muted">never</span>}
                  {isDue(b) && <div style={{ color: "var(--red)", fontWeight: 700 }}>DUE</div>}
                  {b.last_checked && !isDue(b) && <div>{daysSinceChecked(b)}d ago</div>}
                </td>
                <td>
                  {readOnly ? (
                    <span>{b.recheck ?? "weekly"}</span>
                  ) : (
                    <select value={b.recheck ?? "weekly"} onChange={(e) => patch(b.slug, { recheck: e.target.value as any })}>
                      {RECHECKS.map((r) => (<option key={r} value={r}>{r}</option>))}
                    </select>
                  )}
                </td>
                <td>
                  {readOnly ? (
                    <span>{b.listed}</span>
                  ) : (
                    <select value={b.listed} onChange={(e) => patch(b.slug, { listed: e.target.value as Listed })}>
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="dismissed">dismiss</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showDismissed && dismissed.length > 0 && (
        <>
          <hr className="rule" />
          <h2 className="section">Dismissed <span className="count">{dismissed.length}</span></h2>
          <p className="section-note">
            Kept on purpose — the radar checks this list so it can&rsquo;t rediscover them every week.
          </p>
          <table>
            <tbody>
              {dismissed.map((b) => (
                <tr key={b.slug} className="past">
                  <td style={{ fontWeight: 700 }}>{b.name}</td>
                  <td className="mono-sm">{b.discovered_via ? `via ${b.discovered_via.edge} — ${b.discovered_via.band}` : b.notes ?? "—"}</td>
                  <td style={{ width: 150 }}>
                    {!readOnly && <button onClick={() => patch(b.slug, { listed: "active" })}>restore</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {openBand && (
        <BandDrawer band={openBand} onClose={() => setOpen(null)} onPatch={patch} onDelete={remove} readOnly={readOnly} />
      )}
    </>
  );
}

function SuggestionCard({
  band, onPatch, onOpen, readOnly,
}: {
  band: Band;
  onPatch: (s: string, f: Partial<Band>) => void;
  onOpen: () => void;
  readOnly: boolean;
}) {
  const via = band.discovered_via;
  return (
    <div className="card">
      <span className={`stamp ${tierClass(band.tier)}`}>NEW</span>
      <h3 onClick={onOpen} style={{ cursor: "pointer" }}>{band.name}</h3>
      <div className="meta">
        {band.region ?? "region unknown"} · {band.band_status ?? "unknown"}
      </div>
      {via && (
        <div className="sig">
          <strong>{via.edge}</strong> with {via.band}
          <div className="mono-sm" style={{ marginTop: 3 }}>{via.edge_detail}</div>
        </div>
      )}
      {band.signal && <div className="sig">{band.signal}</div>}
      {!readOnly && (
        <div className="foot">
          <div className="filters">
            {[1, 2, 3].map((t) => (
              <button key={t} onClick={() => onPatch(band.slug, { tier: t as Tier, listed: "active" })}>
                {TIER_LABEL[String(t)]}
              </button>
            ))}
          </div>
          <button className="danger" onClick={() => onPatch(band.slug, { listed: "dismissed" })}>
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function AddBand({ onCancel, onCreate }: { onCancel: () => void; onCreate: (n: string, t: Tier) => void }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier>(2);
  return (
    <div className="card" style={{ marginTop: 14, transform: "none" }}>
      <div className="field">
        <label>Band name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Botch" autoFocus />
      </div>
      <div className="field">
        <label>Tier</label>
        <select value={tier} onChange={(e) => setTier(Number(e.target.value) as Tier)}>
          <option value={1}>T1 — drop everything</option>
          <option value={2}>T2 — would drive for it</option>
          <option value={3}>T3 — curious / if it&rsquo;s close</option>
        </select>
      </div>
      <div className="foot">
        <button className="primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), tier)}>
          add to watchlist
        </button>
        <button onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}

function BandDrawer({
  band, onClose, onPatch, onDelete, readOnly,
}: {
  band: Band;
  onClose: () => void;
  onPatch: (s: string, f: Partial<Band>) => void;
  onDelete: (s: string) => void;
  readOnly: boolean;
}) {
  const [notes, setNotes] = useState(band.notes ?? "");
  const [qual, setQual] = useState(band.lineup_qualifier ?? "");
  const [saved, setSaved] = useState(false);

  function save() {
    onPatch(band.slug, { notes, lineup_qualifier: qual || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>{band.name}</h2>
        <div className="sub">
          {band.region ?? "region unknown"} · {band.band_status ?? "unknown"} ·{" "}
          {band.tier ? TIER_LABEL[String(band.tier)] : "untiered"} · {band.listed}
        </div>

        {band.identity === "ambiguous" && (
          <section>
            <h4>⚠ Identity unresolved</h4>
            <p>{band.identity_notes ?? "The radar could not separate this from a same-named act. It will report no shows until this is settled."}</p>
          </section>
        )}

        {band.canonical_url && (
          <section>
            <h4>Canonical identity</h4>
            <p><a href={band.canonical_url} target="_blank" rel="noreferrer">{band.canonical_url}</a></p>
            <p className="mono-sm">Reused every sweep so identity is never re-derived from a name search.</p>
          </section>
        )}

        {band.signal && (
          <section>
            <h4>Latest signal</h4>
            <p>{band.signal}</p>
          </section>
        )}

        {band.no_surface && (
          <section>
            <h4>No online surface</h4>
            <p>
              No socials, Bandcamp or website — this band predates them. The
              &ldquo;dormant account suddenly posts&rdquo; signal can never fire here, so watch
              the label, members&rsquo; current bands, and festival bills instead.
            </p>
          </section>
        )}

        {band.discovered_via && (
          <section>
            <h4>How it was found</h4>
            <p>
              <strong>{band.discovered_via.edge}</strong> with {band.discovered_via.band}
            </p>
            <p className="mono-sm">{band.discovered_via.edge_detail}</p>
          </section>
        )}

        {band.sources?.length ? (
          <section>
            <h4>Sources</h4>
            <ul className="srcs">
              {band.sources.map((s) => (
                <li key={s}><a href={s} target="_blank" rel="noreferrer">{s}</a></li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h4>Checked</h4>
          <p>
            {band.last_checked ?? "never"} · recheck {band.recheck ?? "weekly"}
            {isDue(band) && <strong style={{ color: "var(--red)" }}> · DUE NOW</strong>}
          </p>
        </section>

        <div className="field" style={{ marginTop: 18 }}>
          <label>Lineup qualifier</label>
          {readOnly ? (
            <div className="mono-sm">{qual || "—"}</div>
          ) : (
            <input
              value={qual}
              onChange={(e) => setQual(e.target.value)}
              placeholder="e.g. original singer on vocals"
            />
          )}
          <span className="mono-sm">
            A show that fails this is reported but never alarms.
          </span>
        </div>

        {/* Notes are human-owned and stripped for public viewers before they ever
            reach the client, so there is nothing to render here in read-only mode. */}
        {!readOnly && (
          <div className="field">
            <label>Your notes</label>
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}

        <div className="drawer-foot">
          <div style={{ display: "flex", gap: 8 }}>
            {!readOnly && <button className="primary" onClick={save}>save</button>}
            {saved && <span className="saved">saved</span>}
            <button onClick={onClose}>close</button>
          </div>
          {!readOnly && (
            <button className="danger" onClick={() => onDelete(band.slug)}>delete</button>
          )}
        </div>
      </div>
    </div>
  );
}
