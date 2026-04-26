import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PricingTier {
  id: "free" | "pro" | "pro-plus";
  name: string;
  price: string;
  pricePeriod?: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}

interface PricingTierCardProps {
  tier: PricingTier;
  onUpgrade: () => void;
}

export function PricingTierCard({ tier, onUpgrade }: PricingTierCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-8 transition-shadow",
        tier.highlighted
          ? "border-primary shadow-lg shadow-primary/10"
          : "border-border hover:shadow-md",
      )}
    >
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          推荐
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{tier.name}</span>
        <span className="text-sm text-muted-foreground">{tier.tagline}</span>
      </div>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
        {tier.pricePeriod && (
          <span className="text-sm text-muted-foreground">{tier.pricePeriod}</span>
        )}
      </div>

      <ul className="mt-8 flex flex-col gap-3">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground/90">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex-1" />

      {tier.id === "free" ? (
        <Button asChild className="w-full" variant="outline">
          <Link to="/">开始使用</Link>
        </Button>
      ) : (
        <Button
          onClick={onUpgrade}
          className="w-full"
          variant={tier.highlighted ? "default" : "outline"}
        >
          加微信咨询
        </Button>
      )}
    </div>
  );
}
