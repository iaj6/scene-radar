import { listSources } from "@/lib/sources";
import { SourceList } from "./SourceList";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sources = await listSources();
  const adopted = sources.filter((s) => s.status === "adopted");
  const proposed = sources.filter((s) => s.status === "proposed").length;
  const blind = sources.filter((s) => s.reach === "login-walled" || s.reach === "dead").length;
  const finds = sources.reduce((n, s) => n + (s.produced_finds ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>Sources</h1>
        <p>
          Where the radar looks. These shows are beneath the aggregators, so coverage here
          is the reach of the whole project — more than any amount of prompt tuning.
        </p>
      </div>

      <div className="stats">
        <div className="stat"><b>{adopted.length}</b><span>in rotation</span></div>
        <div className={proposed ? "stat hot" : "stat"}><b>{proposed}</b><span>awaiting ruling</span></div>
        <div className="stat"><b>{finds}</b><span>shows surfaced</span></div>
        <div className="stat"><b>{blind}</b><span>known blind spots</span></div>
      </div>

      <SourceList initial={sources} />
    </>
  );
}
