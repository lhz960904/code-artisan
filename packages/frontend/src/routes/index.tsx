import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/layout/home-page";

export const Route = createFileRoute("/")({
  component: HomePage,
});
