import { AuthForm } from "@/components/auth/AuthForm";

/** Presentational auth — cacheable when middleware skips anon session lookup. */
export const revalidate = 3600;

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
