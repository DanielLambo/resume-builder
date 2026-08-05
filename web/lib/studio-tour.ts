export const STUDIO_TOUR_DONE_KEY = "resumate_studio_tour_done_v1";
export const STUDIO_TOUR_PENDING_KEY = "resumate_studio_tour_pending_v1";

export type StudioTourStep = {
  id: string;
  title: string;
  body: string;
  target: string;
};

export const STUDIO_TOUR_STEPS: readonly StudioTourStep[] = [
  {
    id: "create",
    title: "Start here",
    body: "Create New Resume → pick a template → you’re in the studio.",
    target: "[data-tour='create-resume']",
  },
  {
    id: "library",
    title: "Your library",
    body: "Sheets live here. Open one to edit, or tailor a copy for a job posting.",
    target: "[data-tour='library']",
  },
  {
    id: "quota",
    title: "AI meter",
    body: "Up top. Format and vibe edits spend from this daily quota.",
    target: "[data-tour='ai-quota']",
  },
];
