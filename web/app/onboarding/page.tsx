import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import {
  isSetupDestination,
  trySafeNextPath,
} from "@/lib/auth-next";
import { shouldForceOnboarding } from "@/lib/onboarding/gate";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const afterSetup = trySafeNextPath(params.next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  // Already finished, or grandfathered (has resumes) → product / deep link.
  if (!(await shouldForceOnboarding(user))) {
    const dest =
      afterSetup && !isSetupDestination(afterSetup) ? afterSetup : "/dashboard";
    redirect(dest);
  }

  return <OnboardingWizard userId={user.id} afterSetup={afterSetup} />;
}
