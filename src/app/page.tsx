import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
import { ModelsStrip } from "@/components/marketing/ModelsStrip";
import { CompareShowcase } from "@/components/marketing/CompareShowcase";
import { AutoConsensus } from "@/components/marketing/AutoConsensus";
import { UseCases } from "@/components/marketing/UseCases";
import { Features } from "@/components/marketing/Features";
import { ValueSection } from "@/components/marketing/ValueSection";
import { Testimonials } from "@/components/marketing/Testimonials";
import { Faq } from "@/components/marketing/Faq";
import { Enterprise } from "@/components/marketing/Enterprise";
import { Footer } from "@/components/marketing/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ModelsStrip />
        <CompareShowcase />
        <AutoConsensus />
        <UseCases />
        <Features />
        <ValueSection />
        <Testimonials />
        <Enterprise />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
