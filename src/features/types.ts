import type { LucideIcon } from "lucide-react";

export type FeatureDefinition = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: "available" | "planned";
  accent: string;
};
