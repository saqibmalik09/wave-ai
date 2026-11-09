import type { Metadata } from "next";
import { ImagineComposer } from "./ImagineComposer";

export const metadata: Metadata = {
  title: "Imagine",
  robots: { index: false, follow: false },
};

/**
 * The Imagine surface only — it renders inside the shared dashboard chrome,
 * which owns the sidebar, the session guard and the wallet.
 */
export default function ImaginePage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <h1 className="mb-7 text-center text-2xl font-extrabold tracking-tight text-heading sm:text-[32px] sm:leading-tight">
          What should we imagine?
        </h1>
        <ImagineComposer />
      </div>
    </div>
  );
}
