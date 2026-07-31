import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { shouldForceOnboarding } from "@/lib/onboarding/gate";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  // Already finished, or grandfathered (has resumes) → product.
  if (!(await shouldForceOnboarding(user))) {
    redirect("/dashboard");
  }

  return <OnboardingWizard />;
}
