"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Moon, PanelLeft, Sun, X } from "lucide-react";
import { useState } from "react";
import { featureRegistry } from "@/features/registry";
import { useTheme } from "@/components/theme/theme-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Modulary</span>
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Menü schließen">
            <X size={18} />
          </button>
        </div>
        <nav className="nav">
          <span className="nav-label">Workspace</span>
          <Link className={pathname === "/" ? "active" : ""} href="/" onClick={() => setOpen(false)}>
            <Grid2X2 size={18} /> Dashboard
          </Link>
          <span className="nav-label">Tools</span>
          {featureRegistry.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.id}
                className={pathname === feature.href ? "active" : ""}
                href={feature.href}
                onClick={() => setOpen(false)}
                aria-disabled={feature.status !== "available"}
              >
                <Icon size={18} /> {feature.name}
                {feature.status !== "available" && <small>Bald</small>}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
        </div>
      </aside>
      <div className="content">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setOpen(true)} aria-label="Menü öffnen"><PanelLeft size={20} /></button>
          <span className="brand"><span className="brand-mark">M</span> Modulary</span>
          <button className="icon-button" onClick={toggleTheme} aria-label="Theme wechseln">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
