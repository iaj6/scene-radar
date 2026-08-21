import { listShows, isUpcoming, isUrgent } from "@/lib/store";
import { getViewer } from "@/lib/viewer-server";
import { redactShows } from "@/lib/viewer";
import { Board } from "./Board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getViewer();
  const all = await listShows();
  const shows = redactShows(all, viewer);
  const up = shows.filter((s) => isUpcoming(s));
  const confirmed = up.filter((s) => s.confidence === "CONFIRMED").length;
  const urgent = up.filter((s) => isUrgent(s)).length;
  // Derived from `status`, so it is a triage fact, not a research one — computed from
  // the unredacted list and shown to the owner only.
  const holding = all.filter((s) => s.status === "tickets").length;

  return (
    <>
      <div className="page-head">
        <h1>Shows</h1>
        <p>
          Dates the radar found. CONFIRMED means it fetched a page that states the date —
          anything else is a lead, not a plan.
          {viewer !== "owner" && " Triage status is private and not shown here."}
        </p>
      </div>

      <div className="stats">
        <div className="stat"><b>{up.length}</b><span>upcoming</span></div>
        <div className="stat"><b>{confirmed}</b><span>confirmed</span></div>
        <div className={urgent ? "stat hot" : "stat"}><b>{urgent}</b><span>need a decision</span></div>
        {viewer === "owner" && (
          <div className="stat"><b>{holding}</b><span>tickets held</span></div>
        )}
      </div>

      <Board initial={shows} readOnly={viewer !== "owner"} />
    </>
  );
}
