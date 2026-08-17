"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Bands", key: "bands" as const },
  { href: "/shows", label: "Shows", key: "shows" as const },
  { href: "/sources", label: "Sources", key: "sources" as const },
  { href: "/sweeps", label: "Sweeps", key: null },
];

export function Nav({ counts }: { counts: Record<string, any> }) {
  const path = usePathname();
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="wordmark">
          Scene<span className="rad">Radar</span>
        </div>
        <nav>
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            const n = l.key ? counts[l.key] : 0;
            return (
              <Link key={l.href} href={l.href} className={on ? "on" : ""}>
                {l.label}
                {n > 0 && <span className="n">{n}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
