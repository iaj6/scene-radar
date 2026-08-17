import Link from "next/link";
import { notFound } from "next/navigation";
import { readSweep } from "@/lib/sweeps";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sweep = await readSweep(id);
  if (!sweep) notFound();

  return (
    <>
      <div className="page-head">
        <h1>{sweep.kind} sweep</h1>
        <p>
          {sweep.ran_at?.slice(0, 10)} · <span className="muted">{sweep.id}</span> ·{" "}
          <Link href="/sweeps">back to all sweeps</Link>
        </p>
      </div>

      {sweep.verdict && (
        <div className="stats">
          <div className="stat"><b style={{ fontSize: 18 }}>{sweep.verdict}</b><span>grader verdict</span></div>
          {sweep.stats?.bands_checked != null && (
            <div className="stat"><b>{sweep.stats.bands_checked}</b><span>bands checked</span></div>
          )}
          {sweep.stats?.confirmed != null && (
            <div className="stat"><b>{sweep.stats.confirmed}</b><span>confirmed shows</span></div>
          )}
        </div>
      )}

      <hr className="rule" />
      <h2 className="section">Report</h2>
      <div className="report">{sweep.report}</div>
    </>
  );
}
