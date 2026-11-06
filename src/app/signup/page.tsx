import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create your AiWave account — 100+ AI models in one subscription.",
};

export default function SignupPage() {
  return <SignupForm />;
}
