import { HomeLanding } from "@/components/home/HomeLanding";

/**
 * Marketing landing is statically cacheable.
 * Logged-in users are redirected to /dashboard in middleware (when a session cookie exists).
 */
export const revalidate = 3600;

export default function HomePage() {
  return <HomeLanding />;
}
