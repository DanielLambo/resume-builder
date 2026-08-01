import { redirect } from "next/navigation";

import { HomeLanding } from "@/components/home/HomeLanding";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  } catch {
    // Missing env in local preview — fall through.
  }

  return <HomeLanding />;
}
