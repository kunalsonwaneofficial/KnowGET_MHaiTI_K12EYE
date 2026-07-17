import { docLinks } from "../src/lib/nav";

const LINKS = docLinks([
  "Architecture Overview",
  "Platform Core (Phase 1)",
  "Engineering Standards",
  "Contributing",
]);

export default function DocsHome() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-blue-600">Documentation</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        KnowGET MHaiTI engineering docs
      </h1>
      <p className="mt-3 text-slate-600">
        Living documentation for the platform. Source of record lives in the repository{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">docs/</code> directory.
      </p>
      <ul className="mt-8 space-y-2">
        {LINKS.map((link) => (
          <li key={link.id}>
            <span className="font-medium">{link.title}</span>{" "}
            <span className="text-slate-400">#{link.id}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
