import type { Metadata } from "next";
import { listBands, isDue } from "@/lib/bands";
import { listShows, isUpcoming, isUrgent } from "@/lib/store";
import { listSources } from "@/lib/sources";
import { Nav } from "./Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scene Radar",
  description: "Small-band tour dates the aggregators miss",
};

// Counts in the nav are the whole point of a nav here: they say where work is
// waiting — bands due, shows to triage, sources awaiting a ruling.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [bands, shows, sources] = await Promise.all([
    listBands().catch(() => []),
    listShows().catch(() => []),
    listSources().catch(() => []),
  ]);

  const counts = {
    bands: bands.filter((b) => b.listed === "suggested").length || bands.filter((b) => isDue(b)).length,
    bandsKind: bands.some((b) => b.listed === "suggested") ? "new" : "due",
    shows: shows.filter((s) => isUpcoming(s) && (s.status === "new" || isUrgent(s))).length,
    sources: sources.filter((s) => s.status === "proposed").length,
  };

  return (
    <html lang="en">
      <body>
        <Nav counts={counts} />
        <main>{children}</main>
      </body>
    </html>
  );
}
