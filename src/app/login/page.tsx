import type { Metadata } from "next";
import { getBrand } from "@/lib/brand.server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Login",
  description: "Log in to AiWave — 100+ AI models in one subscription.",
};

export default async function LoginPage() {
  const { appName } = await getBrand();
  return <LoginForm appName={appName} />;
}
