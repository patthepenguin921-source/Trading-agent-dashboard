import { redirect } from "next/navigation";

// Old single-agent route, kept as a redirect for any bookmarked/cached
// links now that instructions live per-agent at /agent/[id]/instructions.
export default function LegacyInstructionsRedirect() {
  redirect("/agent/plutus/instructions");
}
