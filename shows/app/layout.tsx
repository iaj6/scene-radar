import type { Metadata } from "next";
import { listBands, isDue } from "@/lib/bands";
import { listShows, isUpcoming, isUrgent } from "@/lib/store";
import { listSources } from "@/lib/sources";
import { getViewer } from "@/lib/viewer-server";
import { Nav } from "./Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scene Radar",
  description: "Small-band tour dates the aggregators miss",
};

// Counts in the nav are the whole point of a nav here: they say where work is
// waiting — bands due, shows to triage, sources awaiting a ruling.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const [bands, shows, sources] = await Promise.all([
    listBands().catch(() => []),
    listShows().catch(() => []),
    listSources().catch(() => []),
  ]);

  // These badges say where *your* work is waiting — bands due, shows to triage,
  // sources awaiting a ruling. That's a statement about your attention, and the shows
  // count reads `status` directly, so a public viewer gets none of them.
  const counts =
    viewer === "owner"
      ? {
          bands: bands.filter((b) => b.listed === "suggested").length || bands.filter((b) => isDue(b)).length,
          bandsKind: bands.some((b) => b.listed === "suggested") ? "new" : "due",
          shows: shows.filter((s) => isUpcoming(s) && (s.status === "new" || isUrgent(s))).length,
          sources: sources.filter((s) => s.status === "proposed").length,
        }
      : {};

  return (
    <html lang="en">
      <body>
        <Nav counts={counts} />
        {viewer !== "owner" && (
          <div className="public-banner">
            <b>Read-only view.</b> A live board from a working agent — the roster, dates
            and sources are real. Triage status and private notes are not shown.
            <a href="https://github.com/iaj6/scene-radar" target="_blank" rel="noreferrer">
              source on GitHub
            </a>
          </div>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
