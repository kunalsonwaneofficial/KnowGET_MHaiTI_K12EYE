import { adminSections } from "../src/lib/admin";

const SECTIONS = adminSections([
  "Tenant Operations",
  "Platform Configuration",
  "Security & Access",
  "Observability",
]);

export default function AdminHome() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-blue-600">Administration</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Platform administration</h1>
      <p className="mt-3 text-slate-600">
        Foundation console for tenant operations and platform configuration (expanded in P5-D03).
      </p>
      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <li
            key={section.href}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium"
          >
            {section.label}
          </li>
        ))}
      </ul>
    </main>
  );
}
