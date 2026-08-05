import { AuthForm } from "@/components/auth/AuthForm";

export const revalidate = 3600;

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
