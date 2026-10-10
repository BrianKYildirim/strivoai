/**
 * Canonical role / industry taxonomies.
 *
 * These lists were MOVED VERBATIM out of `src/pages/Onboarding.tsx` (quick task
 * 260712-msh, Task 1E). Not a single entry was added, removed, reordered, or
 * reworded — this is a pure extraction so that:
 *
 *   1. `Onboarding.tsx` (Step 3 chips) and
 *   2. the `public.goal_taxonomy` seed in
 *      `supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql`
 *      (which the deterministic zero-AI Goal Readiness scorer parses the user's
 *      professional goal against — CONTEXT §9e)
 *
 * have ONE authorable source and cannot drift apart.
 *
 * `supabase/functions/_shared/goal-readiness-guard.test.ts` parses BOTH this file
 * and the migration seed and asserts they are set-equal in both directions. If you
 * add a term here, add it to the migration seed (and vice versa) or the offline
 * gate goes red.
 */

export const ROLE_OPTIONS = [
  // Business & Finance
  "Investment Banking",
  "Private Equity",
  "Venture Capital",
  "Management Consulting",
  "Corporate Strategy",
  "Accounting",
  "Financial Analysis",
  // Tech & Engineering
  "Software Engineering",
  "Data Science",
  "Machine Learning",
  "Product Management",
  "UX/UI Design",
  "DevOps",
  "Cybersecurity",
  // Healthcare & Sciences
  "Pre-Med",
  "Clinical Research",
  "Biotech Research",
  "Pharmaceutical",
  "Nursing",
  "Public Health",
  // Academia & Research
  "Research (Academic)",
  "Graduate Studies",
  "Teaching/Education",
  "Lab Research",
  // Creative & Media
  "Marketing",
  "Journalism",
  "Content Creation",
  "Graphic Design",
  "Film/Media Production",
  // Law & Policy
  "Law/Legal",
  "Public Policy",
  "Government",
  "Nonprofit",
  // Other
  "Operations",
  "Human Resources",
  "Sales",
  "Supply Chain",
  "Real Estate",
  "Entrepreneurship",
];

export const INTEREST_OPTIONS = [
  // Finance & Business
  "Finance",
  "Investment Banking",
  "Private Equity",
  "Venture Capital",
  "Asset Management",
  "Insurance",
  "Consulting",
  "FinTech",
  // Tech
  "Technology",
  "E-commerce",
  "Startups",
  "Artificial Intelligence",
  "Cybersecurity",
  // Healthcare & Sciences
  "Healthcare",
  "Pharmaceuticals",
  "Biotechnology",
  "Life Sciences",
  // Traditional Industries
  "Consumer Goods",
  "Real Estate",
  "Energy",
  "Manufacturing",
  "Retail",
  "Automotive",
  "Aerospace & Defense",
  // Media & Creative
  "Media & Entertainment",
  "Advertising",
  "Gaming",
  "Sports",
  // Professional Services
  "Legal",
  "Accounting",
  "Management Consulting",
  "Professional Services",
  // Public Sector
  "Government",
  "Nonprofit",
  "Education",
  // Other
  "Hospitality",
  "Transportation",
  "Logistics",
  "Agriculture",
  "Telecommunications",
];
