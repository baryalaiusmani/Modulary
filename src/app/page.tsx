import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { FeatureCard } from "@/components/dashboard/feature-card";
import { featureRegistry } from "@/features/registry";

export default function DashboardPage() {
  const available = featureRegistry.filter((feature) => feature.status === "available");

  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="eyebrow"><Sparkles size={15} /> AI Workspace</span>
          <h1>Werkzeuge, die Arbeit<br />spürbar einfacher machen.</h1>
          <p>
            Eine modulare Plattform für sichere, nachvollziehbare und
            erweiterbare Datenverarbeitung.
          </p>
          <Link className="button primary" href={available[0]?.href ?? "#tools"}>
            Erstes Tool öffnen <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-panel" aria-hidden="true">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="hero-stat">
            <span>Verfügbare Tools</span>
            <strong>{available.length}</strong>
          </div>
          <div className="hero-stat offset">
            <span>Architektur</span>
            <strong>Modular</strong>
          </div>
        </div>
      </section>

      <section id="tools" className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Toolbox</span>
            <h2>Alle Werkzeuge</h2>
          </div>
          <p>Jedes Feature ist unabhängig aufgebaut und lässt sich separat erweitern.</p>
        </div>
        <div className="feature-grid">
          {featureRegistry.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </section>
    </main>
  );
}
