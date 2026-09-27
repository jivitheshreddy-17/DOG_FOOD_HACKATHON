// Home page — redirects to the public gallery.
// The /projects page (Module 3) is the primary entry point per .dogfood.toml.
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/projects");
}
