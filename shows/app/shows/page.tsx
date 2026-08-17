import { listShows, isUpcoming, isUrgent } from "@/lib/store";
import { Board } from "./Board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const shows = await listShows();
  const up = shows.filter((s) => isUpcoming(s));
  const confirmed = up.filter((s) => s.confidence === "CONFIRMED").length;
  const urgent = up.filter((s) => isUrgent(s)).length;
  const holding = shows.filter((s) => s.status === "tickets").length;

  return (
    <>
      <div className="page-head">
        <h1>Shows</h1>
        <p>
          Dates the radar found. CONFIRMED means it fetched a page that states the date —
          anything else is a lead, not a plan.
        </p>
      </div>

      <div className="stats">
        <div className="stat"><b>{up.length}</b><span>upcoming</span></div>
        <div className="stat"><b>{confirmed}</b><span>confirmed</span></div>
        <div className={urgent ? "stat hot" : "stat"}><b>{urgent}</b><span>need a decision</span></div>
        <div className="stat"><b>{holding}</b><span>tickets held</span></div>
      </div>

      <Board initial={shows} />
    </>
  );
}
