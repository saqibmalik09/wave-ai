import type { Metadata } from "next";
import { getBrand } from "@/lib/brand.server";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create your AiWave account — 100+ AI models in one subscription.",
};

export default async function SignupPage() {
  const { appName } = await getBrand();
  return <SignupForm appName={appName} />;
}
