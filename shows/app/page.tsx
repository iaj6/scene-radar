import { listBands, isDue } from "@/lib/bands";
import { Roster } from "./Roster";

export const dynamic = "force-dynamic";

export default async function Page() {
  const bands = await listBands();
  const active = bands.filter((b) => b.listed === "active");
  const due = active.filter((b) => isDue(b)).length;
  const suggested = bands.filter((b) => b.listed === "suggested").length;
  const stirring = active.filter((b) => b.band_status === "stirring").length;

  return (
    <>
      <div className="page-head">
        <h1>The Watchlist</h1>
        <p>
          Who the radar is watching. You curate this — the agent reads it at the start of
          every sweep, and it can suggest but never promote.
        </p>
      </div>

      <div className="stats">
        <div className="stat"><b>{active.length}</b><span>on the list</span></div>
        <div className={due ? "stat hot" : "stat"}><b>{due}</b><span>due for a check</span></div>
        <div className={stirring ? "stat hot" : "stat"}><b>{stirring}</b><span>stirring</span></div>
        <div className={suggested ? "stat hot" : "stat"}><b>{suggested}</b><span>suggested</span></div>
      </div>

      <Roster initial={bands} />
    </>
  );
}
