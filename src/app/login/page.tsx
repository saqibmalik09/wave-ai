import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Login",
  description: "Log in to AiWave — 100+ AI models in one subscription.",
};

export default function LoginPage() {
  return <LoginForm />;
}
