import Link from "next/link";
import { listSweeps } from "@/lib/sweeps";

export const dynamic = "force-dynamic";

const VERDICT_CLASS: Record<string, string> = {
  satisfied: "badge CONFIRMED",
  max_iterations_reached: "badge SIGNAL",
  failed: "badge hot",
  interrupted: "badge SIGNAL",
};

export default async function Page() {
  const sweeps = await listSweeps();

  return (
    <>
      <div className="page-head">
        <h1>Sweeps</h1>
        <p>
          Every run the radar has made, with the grader&rsquo;s verdict. A sweep that finds
          nothing and says so plainly is a pass — most weeks nothing happens.
        </p>
      </div>

      {sweeps.length === 0 ? (
        <div className="empty">
          <strong>No sweeps recorded</strong>
          Runs land here automatically once a sweep finishes.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Ran</th>
              <th style={{ width: 90 }}>Kind</th>
              <th>Result</th>
              <th style={{ width: 150 }}>Grader</th>
            </tr>
          </thead>
          <tbody>
            {sweeps.map((s) => (
              <tr key={s.id}>
                <td className="mono-sm">{s.ran_at?.slice(0, 10)}</td>
                <td style={{ textTransform: "uppercase", fontSize: 11.5 }}>{s.kind}</td>
                <td>
                  <Link href={`/sweeps/${s.id}`} style={{ fontWeight: 700 }}>
                    {s.stats?.bands_checked != null
                      ? `${s.stats.bands_checked} bands checked`
                      : "read the report"}
                  </Link>
                  <div className="mono-sm">
                    {s.stats?.confirmed != null && `${s.stats.confirmed} confirmed · `}
                    {s.stats?.nodes != null && `frontier ${s.stats.nodes} · `}
                    <span className="muted">{s.id}</span>
                  </div>
                </td>
                <td>
                  {s.verdict ? (
                    <span className={VERDICT_CLASS[s.verdict] ?? "badge SIGNAL"}>{s.verdict}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
