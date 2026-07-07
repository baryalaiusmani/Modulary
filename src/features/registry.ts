import { FileSpreadsheet, Globe, MailSearch, MessageSquareText, Radar } from "lucide-react";
import type { FeatureDefinition } from "@/features/types";

export const featureRegistry: FeatureDefinition[] = [
  {
    id: "excel-intelligence",
    name: "Excel Intelligence",
    description: "Alte und neue Excel-Listen vergleichen und neue Datensaetze automatisch erkennen.",
    href: "/tools/excel",
    icon: FileSpreadsheet,
    status: "available",
    accent: "mint",
  },
  {
    id: "itsa-scraper",
    name: "it-sa Scraper",
    description: "Aussteller scannen und automatisch neue Firmen gegen den lokalen Bestand erkennen.",
    href: "/tools/scraper",
    icon: Radar,
    status: "available",
    accent: "blue",
  },
  {
    id: "domain-formatter",
    name: "Domain Formatter",
    description: "Domain-Spalten per Klick in ein einheitliches Format bringen, ohne Zeilen zu verschieben.",
    href: "/tools/domain-formatter",
    icon: Globe,
    status: "available",
    accent: "amber",
  },
  {
    id: "email-finder",
    name: "Email Suche",
    description: "Fehlende E-Mail-Adressen aus Firmenlisten ueber oeffentliche Unternehmenswebseiten finden.",
    href: "/tools/email-finder",
    icon: MailSearch,
    status: "available",
    accent: "rose",
  },
  {
    id: "text-assistant",
    name: "Text Assistant",
    description: "Beispielmodul für ein zukünftiges, unabhängig entwickeltes Feature.",
    href: "/",
    icon: MessageSquareText,
    status: "planned",
    accent: "violet",
  },
];
