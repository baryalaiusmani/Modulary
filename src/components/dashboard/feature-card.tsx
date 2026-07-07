import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { FeatureDefinition } from "@/features/types";

export function FeatureCard({ feature }: { feature: FeatureDefinition }) {
  const Icon = feature.icon;
  return (
    <article className="feature-card">
      <div className={`feature-icon ${feature.accent}`}><Icon size={22} /></div>
      <div className="feature-meta">
        <span className={`status ${feature.status}`}>{feature.status === "available" ? "Verfügbar" : "Geplant"}</span>
      </div>
      <h3>{feature.name}</h3>
      <p>{feature.description}</p>
      <Link className={feature.status === "available" ? "" : "disabled"} href={feature.href}>
        {feature.status === "available" ? "Tool öffnen" : "In Vorbereitung"} <ArrowUpRight size={16} />
      </Link>
    </article>
  );
}
