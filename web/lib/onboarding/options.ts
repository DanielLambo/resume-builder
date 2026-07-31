import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Briefcase,
  Building2,
  ChartColumn,
  Compass,
  GraduationCap,
  Megaphone,
  Mic,
  Palette,
  PlayCircle,
  Podcast,
  Rocket,
  Search,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

import type { JobType, ReferralSource, TargetField } from "@/lib/onboarding/schema";

export type OptionDef<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon: LucideIcon;
};

export const REFERRAL_OPTIONS: OptionDef<ReferralSource>[] = [
  { id: "linkedin", label: "LinkedIn", description: "Professional network", icon: AtSign },
  { id: "word_of_mouth", label: "Word of mouth", description: "Friend or colleague", icon: Users },
  { id: "x", label: "X (Twitter)", description: "Social feed", icon: Megaphone },
  { id: "google", label: "Google / web", description: "Search result", icon: Search },
  { id: "youtube", label: "YouTube", description: "Creator or tutorial", icon: PlayCircle },
  { id: "podcast_blog", label: "Podcast / blog", description: "Long-form content", icon: Podcast },
  { id: "other", label: "Other", description: "Something else", icon: Sparkles },
];

export const JOB_TYPE_OPTIONS: OptionDef<JobType>[] = [
  { id: "internship", label: "Internships / Co-op", icon: GraduationCap },
  { id: "entry_level", label: "Entry level / New grad", icon: Rocket },
  { id: "full_time", label: "Full-time roles", icon: Briefcase },
  { id: "part_time", label: "Part-time / Freelance", icon: Wrench },
  { id: "exploring", label: "Just exploring / Student", icon: Compass },
];

export const FIELD_OPTIONS: OptionDef<TargetField>[] = [
  { id: "software_engineering", label: "Software Engineering", icon: Building2 },
  { id: "product_management", label: "Product Management", icon: Briefcase },
  { id: "ui_ux", label: "UI/UX Design", icon: Palette },
  { id: "data_science", label: "Data Science", icon: ChartColumn },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "finance", label: "Finance", icon: ChartColumn },
  { id: "other", label: "Other", icon: Mic },
];

export function labelForReferral(id: string | undefined): string {
  return REFERRAL_OPTIONS.find((o) => o.id === id)?.label ?? "Not set";
}

export function labelsForJobTypes(ids: string[]): string[] {
  return ids.map((id) => JOB_TYPE_OPTIONS.find((o) => o.id === id)?.label ?? id);
}

export function labelsForFields(ids: string[]): string[] {
  return ids.map((id) => FIELD_OPTIONS.find((o) => o.id === id)?.label ?? id);
}
