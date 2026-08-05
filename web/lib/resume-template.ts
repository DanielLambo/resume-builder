/**
 * Industry-proven resume templates for new grads.
 * Self-contained `article` docs — no custom .cls (compiles on latexonline / local TeX).
 */

export type ResumeTemplateId =
  | "new-grad"
  | "swe"
  | "pm"
  | "ee"
  | "mecheng"
  | "blank";

export type ResumeTemplate = {
  id: ResumeTemplateId;
  name: string;
  audience: string;
  description: string;
  /** Short tags shown in the picker. */
  tags: string[];
  latex: string;
  isDefault?: boolean;
};

export type ResumeDataJson = {
  latex: string;
  template: ResumeTemplateId | string;
  version: number;
};

export const DEFAULT_RESUME_TITLE = "Untitled Resume";

export const HOUSE_LATEX_PREAMBLE = String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.55in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage[hidelinks]{hyperref}
\usepackage{parskip}
\usepackage{enumitem}
\setlist[itemize]{leftmargin=*,itemsep=0.12em,topsep=0.15em,parsep=0pt,partopsep=0pt}
\pagestyle{empty}
\newcommand{\headerblock}[2]{%
  \begin{center}
    {\LARGE\bfseries #1}\\[0.3em]
    {\small #2}
  \end{center}
}
\newcommand{\entry}[3]{%
  \textbf{#1} \hfill {\small #2}\\
  \textit{#3}\vspace{0.15em}
}
`;

const NEW_GRAD_LATEX = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Alex Rivera}{alex.rivera@email.com $\\cdot$ (555) 010-2211 $\\cdot$ linkedin.com/in/alexrivera $\\cdot$ City, ST}

\\section*{Education}
\\entry{State University}{Expected May 2026}{B.S.\\ Computer Science; GPA 3.6/4.0}
\\begin{itemize}
  \\item Coursework: Data Structures, Algorithms, Databases, Operating Systems, Product Design
  \\item Honors: Dean's List (4 semesters); Scholarship for First-Generation Students
\\end{itemize}

\\section*{Projects}
\\entry{Campus Connect (React, Node)}{2025}{Team lead $\\cdot$ 4 engineers}
\\begin{itemize}
  \\item Shipped a campus-events app used by 800+ students in the first term; cut event discovery time from days to minutes.
  \\item Built REST APIs and Postgres schema; added auth and role-based event moderation.
\\end{itemize}
\\entry{BudgetBot (Python)}{2024}{Solo}
\\begin{itemize}
  \\item Automated CSV expense categorization for student orgs; saved treasurers $\\sim$3 hrs/week during audits.
\\end{itemize}

\\section*{Experience}
\\entry{Software Engineering Intern, Northstar Labs}{May--Aug 2025}{Remote}
\\begin{itemize}
  \\item Delivered 2 production features on the customer dashboard (TypeScript/React); reduced support tickets for onboarding by 18\\%.
  \\item Wrote integration tests and a runbook; pair-reviewed PRs with the platform team.
\\end{itemize}
\\entry{Orientation Leader, State University}{Aug 2023--May 2025}{Campus}
\\begin{itemize}
  \\item Led weekly sessions for 40 first-years; improved survey NPS from 62 to 79 over two cohorts.
\\end{itemize}

\\section*{Skills \\& Activities}
\\textbf{Languages:} Python, TypeScript, SQL\\quad
\\textbf{Tools:} Git, Figma, Excel\\quad
\\textbf{Activities:} Product Club, Hackathon organizer
\\end{document}
`;

const SWE_LATEX = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Jordan Lee}{jordan.lee@email.com $\\cdot$ github.com/jordanlee $\\cdot$ linkedin.com/in/jordanlee $\\cdot$ City, ST}

\\section*{Education}
\\entry{State University}{May 2026}{B.S.\\ Computer Science; Minor in Math; GPA 3.7/4.0}
\\begin{itemize}
  \\item Coursework: Algorithms, Distributed Systems, Compilers, Machine Learning
\\end{itemize}

\\section*{Technical Experience}
\\entry{Software Engineering Intern, Cloudspan}{May--Aug 2025}{San Francisco, CA}
\\begin{itemize}
  \\item Built a Go microservice for usage metering serving 2M events/day; p99 latency under 40ms.
  \\item Added OpenTelemetry traces and Grafana dashboards; cut mean time-to-detect for billing bugs by 35\\%.
  \\item Owned a weekly on-call rotation with senior engineers; closed 12 Sev-3 tickets.
\\end{itemize}
\\entry{Undergraduate Researcher, Systems Lab}{Jan 2024--Present}{State University}
\\begin{itemize}
  \\item Implemented a C++ prototype for lock-free queues; benchmarked 1.8$\\times$ throughput vs.\\ mutex baseline.
  \\item Co-authored an internal tech report; presented findings at the undergrad research symposium.
\\end{itemize}

\\section*{Projects}
\\entry{Rafty --- Distributed KV Store}{2025}{Go, Docker}
\\begin{itemize}
  \\item Implemented Raft leader election and log replication; passed 40/42 Jepsen-style chaos tests locally.
\\end{itemize}
\\entry{LintBot}{2024}{TypeScript, GitHub Actions}
\\begin{itemize}
  \\item CI bot that comments style nits on PRs; adopted by 3 campus open-source clubs.
\\end{itemize}

\\section*{Skills}
\\textbf{Languages:} Go, Python, TypeScript, C++, SQL\\quad
\\textbf{Infra:} Docker, Kubernetes (basics), AWS, Postgres, Redis\\quad
\\textbf{Practices:} Unit/integration testing, code review, design docs
\\end{document}
`;

const PM_LATEX = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Sam Patel}{sam.patel@email.com $\\cdot$ linkedin.com/in/sampatel $\\cdot$ City, ST}

\\section*{Education}
\\entry{State University}{May 2026}{B.S.\\ Business + Computer Science (joint); GPA 3.65/4.0}
\\begin{itemize}
  \\item Coursework: Product Management, Human--Computer Interaction, Statistics, A/B Testing
  \\item Case competitions: 2nd place campus Product Challenge (2025)
\\end{itemize}

\\section*{Product Experience}
\\entry{Associate Product Manager Intern, BrightPath}{May--Aug 2025}{New York, NY}
\\begin{itemize}
  \\item Owned onboarding activation for new freelancers; shipped checklist + empty states that lifted Day-7 activation 12\\% (n=18k).
  \\item Wrote PRDs and success metrics; ran 6 user interviews and synthesized themes for Q3 roadmap.
  \\item Partnered with design and eng on a 3-sprint MVP; cut scope by 2 features to hit the launch date.
\\end{itemize}
\\entry{Product Intern, Campus Health App}{Jan--May 2025}{State University}
\\begin{itemize}
  \\item Defined problem statement and JTBD for appointment booking; reduced no-shows 9\\% after reminder flow launch.
\\end{itemize}

\\section*{Projects \\& Leadership}
\\entry{MealMatch --- Marketplace Capstone}{2025}{PM lead}
\\begin{itemize}
  \\item Led discovery for a student meal-swap marketplace; prioritized backlog with RICE; shipped web MVP to 120 beta users.
  \\item Built a simple funnel dashboard (Mixpanel); identified drop-off at verification and fixed copy in 1 sprint.
\\end{itemize}
\\entry{President, Product Management Club}{2024--Present}{}
\\begin{itemize}
  \\item Grew membership from 35 to 110; hosted 8 industry speakers and a mock APM interview series.
\\end{itemize}

\\section*{Skills}
\\textbf{Product:} Roadmapping, PRDs, user interviews, A/B tests, prioritization (RICE/ICE)\\quad
\\textbf{Tools:} Figma, Jira, SQL (basic), Amplitude/Mixpanel, Notion\\quad
\\textbf{Soft:} Stakeholder communication, facilitation, storytelling with data
\\end{document}
`;

const EE_LATEX = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Taylor Nguyen}{taylor.nguyen@email.com $\\cdot$ linkedin.com/in/taylornguyen $\\cdot$ City, ST}

\\section*{Education}
\\entry{State University}{May 2026}{B.S.\\ Electrical Engineering; GPA 3.55/4.0}
\\begin{itemize}
  \\item Coursework: Circuits II, Embedded Systems, Digital Logic, Signals \\& Systems, Power Electronics
  \\item Labs: PCB design (KiCad), STM32 firmware, oscilloscope/logic analyzer workflows
\\end{itemize}

\\section*{Engineering Experience}
\\entry{Electrical Engineering Intern, VoltForge}{May--Aug 2025}{Austin, TX}
\\begin{itemize}
  \\item Designed and validated a 24V buck converter prototype; met efficiency target of 92\\% at nominal load.
  \\item Brought up STM32 firmware for sensor polling; reduced ADC noise via filtering and layout revisions.
  \\item Documented bring-up procedures; cut new-hire lab setup time from 2 days to half a day.
\\end{itemize}
\\entry{Lab Assistant, Embedded Systems Course}{Aug 2024--May 2025}{State University}
\\begin{itemize}
  \\item Supported 60 students debugging UART/SPI labs; wrote a FAQ that cut repeat office-hour questions 40\\%.
\\end{itemize}

\\section*{Projects}
\\entry{Autonomous Line-Follower Robot}{2025}{Team of 3}
\\begin{itemize}
  \\item Built motor driver PCB and PID speed control on an STM32; completed competition course with 0 faults.
\\end{itemize}
\\entry{Home Energy Monitor}{2024}{Solo}
\\begin{itemize}
  \\item Non-invasive CT sensor + ESP32 logger; streamed power data to a lightweight dashboard for 30 days.
\\end{itemize}

\\section*{Skills}
\\textbf{Hardware:} PCB (KiCad), soldering, oscilloscopes, multimeters, power supplies\\quad
\\textbf{Embedded:} C/C++, STM32, FreeRTOS (basics), I$^{2}$C/SPI/UART\\quad
\\textbf{Tools:} MATLAB, SPICE, Git, Python for data logs
\\end{document}
`;

const MECHENG_LATEX = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Casey Morgan}{casey.morgan@email.com $\\cdot$ linkedin.com/in/caseymorgan $\\cdot$ City, ST}

\\section*{Education}
\\entry{State University}{May 2026}{B.S.\\ Mechanical Engineering; GPA 3.5/4.0}
\\begin{itemize}
  \\item Coursework: Statics/Dynamics, Thermodynamics, Fluid Mechanics, Machine Design, CAD/FEA
  \\item FE exam: scheduled (discipline: Mechanical)
\\end{itemize}

\\section*{Engineering Experience}
\\entry{Mechanical Engineering Intern, Apex Dynamics}{May--Aug 2025}{Detroit, MI}
\\begin{itemize}
  \\item Redesigned a bracket in SolidWorks; FEA showed 22\\% lower peak stress at equal mass.
  \\item Supported DFM reviews with suppliers; resolved 5 fit issues before tooling freeze.
  \\item Built a torque-test fixture; collected 200+ data points informing material choice.
\\end{itemize}
\\entry{Fabrication Shop Assistant}{Sep 2023--May 2025}{State University}
\\begin{itemize}
  \\item Trained 25 students on mill/lathe safety; maintained tool crib inventory with zero lost-time incidents.
\\end{itemize}

\\section*{Projects}
\\entry{Senior Design --- Compact Heat Exchanger}{2025--2026}{Team of 5}
\\begin{itemize}
  \\item Led CAD and thermal analysis for a compact heat exchanger; prototype exceeded target $\\Delta$T by 8\\%.
  \\item Managed BOM and \\$2.4k budget; delivered first article two weeks ahead of design review.
\\end{itemize}
\\entry{Formula SAE Suspension Subteam}{2023--2025}{}
\\begin{itemize}
  \\item Modeled uprights and validated with FEA; contributed to a 15\\% unsprung-mass reduction vs.\\ prior year.
\\end{itemize}

\\section*{Skills}
\\textbf{CAD/Analysis:} SolidWorks, ANSYS (structural), MATLAB\\quad
\\textbf{Manufacturing:} Mill, lathe, 3D printing, GD\\&T (basic)\\quad
\\textbf{Other:} Technical writing, design reviews, cross-functional collaboration
\\end{document}
`;

const BLANK_LATEX = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Your Name}{you@email.com $\\cdot$ linkedin.com/in/you $\\cdot$ City, ST}

\\section*{Education}
\\entry{University}{Graduation Year}{Degree; GPA}
\\begin{itemize}
  \\item Relevant coursework and honors
\\end{itemize}

\\section*{Experience}
\\entry{Role, Company}{Dates}{Location}
\\begin{itemize}
  \\item Impact bullet with metric
  \\item Impact bullet with metric
\\end{itemize}

\\section*{Projects}
\\entry{Project Name}{Year}{Stack / role}
\\begin{itemize}
  \\item What you built and the outcome
\\end{itemize}

\\section*{Skills}
Languages, tools, and strengths
\\end{document}
`;

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: "new-grad",
    name: "New Grad General",
    audience: "Any major · internships + projects",
    description:
      "Education and projects first — the layout hiring managers expect from campus candidates.",
    tags: ["Default", "Campus", "Internships"],
    latex: NEW_GRAD_LATEX,
    isDefault: true,
  },
  {
    id: "swe",
    name: "Software Engineering",
    audience: "CS / SWE new grads",
    description:
      "Systems-flavored bullets, internships, and shipped projects with latency and scale signals.",
    tags: ["CS", "Backend", "Intern"],
    latex: SWE_LATEX,
  },
  {
    id: "pm",
    name: "Product Management",
    audience: "APM / PM new grads",
    description:
      "PRDs, activation metrics, discovery, and club leadership — built for APM recruiting.",
    tags: ["APM", "Metrics", "Discovery"],
    latex: PM_LATEX,
  },
  {
    id: "ee",
    name: "Electrical Engineering",
    audience: "EE new grads",
    description:
      "Circuits, embedded, PCB, and lab work with efficiency and bring-up outcomes.",
    tags: ["Embedded", "PCB", "Hardware"],
    latex: EE_LATEX,
  },
  {
    id: "mecheng",
    name: "Mechanical Engineering",
    audience: "ME new grads",
    description:
      "CAD/FEA, DFM, shop experience, and senior design — Formula SAE–friendly.",
    tags: ["CAD", "FEA", "Design"],
    latex: MECHENG_LATEX,
  },
  {
    id: "blank",
    name: "Blank Starter",
    audience: "Start from a clean scaffold",
    description: "Section headers only — fill with your own story.",
    tags: ["Minimal"],
    latex: BLANK_LATEX,
  },
];

export const DEFAULT_TEMPLATE_ID: ResumeTemplateId = "new-grad";

/** Back-compat alias used by older create paths. */
export const DEFAULT_RESUME_LATEX =
  RESUME_TEMPLATES.find((t) => t.isDefault)?.latex ?? NEW_GRAD_LATEX;

export function getTemplate(id: string | null | undefined): ResumeTemplate {
  const found = RESUME_TEMPLATES.find((t) => t.id === id);
  return found ?? RESUME_TEMPLATES.find((t) => t.isDefault)!;
}

export function createResumeData(
  templateId: string = DEFAULT_TEMPLATE_ID,
): ResumeDataJson {
  const template = getTemplate(templateId);
  return {
    latex: template.latex,
    template: template.id,
    version: 1,
  };
}

export function createDefaultResumeData(): ResumeDataJson {
  return createResumeData(DEFAULT_TEMPLATE_ID);
}

export function getLatexFromDataJson(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return DEFAULT_RESUME_LATEX;
  }
  const latex = (data as { latex?: unknown }).latex;
  return typeof latex === "string" && latex.trim() ? latex : DEFAULT_RESUME_LATEX;
}

export function getTemplateIdFromDataJson(data: unknown): ResumeTemplateId {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return DEFAULT_TEMPLATE_ID;
  }
  const raw = (data as { template?: unknown }).template;
  if (typeof raw === "string" && RESUME_TEMPLATES.some((t) => t.id === raw)) {
    return raw as ResumeTemplateId;
  }
  return DEFAULT_TEMPLATE_ID;
}

export function isResumeTemplateId(value: string): value is ResumeTemplateId {
  return RESUME_TEMPLATES.some((t) => t.id === value);
}
