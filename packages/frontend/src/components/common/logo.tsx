import { useId } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "color" | "mono";
}

export function Logo({ className, variant = "color" }: LogoProps) {
  const id = useId();
  const bgId = `ca-bg-${id}`;
  const shineId = `ca-shine-${id}`;

  if (variant === "mono") {
    return (
      <svg
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("size-6", className)}
        aria-hidden
      >
        <rect width="96" height="96" rx="22" className="fill-foreground" />
        <path
          d="M28 74 L42 22 H54 L68 74 H58.5 L55 60 H41 L37.5 74 Z M43.2 51 H52.8 L48 32.5 Z"
          className="fill-background"
        />
        <rect
          x="36"
          y="50"
          width="24"
          height="4.5"
          rx="2.25"
          transform="rotate(-22 48 52)"
          className="fill-primary"
        />
        <circle cx="74" cy="22" r="3" className="fill-background" opacity="0.6" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8487FF" />
          <stop offset="100%" stopColor="#5457E8" />
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill={`url(#${bgId})`} />
      <rect width="96" height="96" rx="22" fill={`url(#${shineId})`} />
      <path
        d="M28 74 L42 22 H54 L68 74 H58.5 L55 60 H41 L37.5 74 Z M43.2 51 H52.8 L48 32.5 Z"
        fill="#FFFFFF"
      />
      <rect
        x="36"
        y="50"
        width="24"
        height="4.5"
        rx="2.25"
        transform="rotate(-22 48 52)"
        fill="#FFC6C6"
      />
      <circle cx="74" cy="22" r="3" fill="#C3FAF5" />
    </svg>
  );
}
