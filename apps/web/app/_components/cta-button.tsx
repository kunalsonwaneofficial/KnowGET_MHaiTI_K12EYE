"use client";

import { Button } from "@knowget/ui";

/** Client component demonstrating consumption of the shared @knowget/ui kit. */
export function CtaButton() {
  return (
    <Button variant="primary" onClick={() => console.log("cta clicked")}>
      Explore the platform
    </Button>
  );
}
