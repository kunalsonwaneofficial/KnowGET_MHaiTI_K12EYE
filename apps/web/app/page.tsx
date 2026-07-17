import { CtaButton } from "./_components/cta-button";
import { getPlatformTagline } from "../src/lib/site";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-blue-600">KnowGET MHaiTI</p>
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
        {getPlatformTagline()}
      </h1>
      <p className="text-lg text-slate-600">
        The unified, AI-native operating system for K-12 institutions — one platform for academics,
        operations, finance, people, and intelligence.
      </p>
      <CtaButton />
    </main>
  );
}
