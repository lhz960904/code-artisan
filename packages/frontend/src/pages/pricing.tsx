import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/pages/layout/root";
import { HomeHeader } from "@/components/layout/home-header";
import {
  PricingTierCard,
  type PricingTier,
} from "@/components/pricing/pricing-tier-card";
import { WechatQrModal } from "@/components/pricing/wechat-qr-modal";

const TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: "免费",
    tagline: "适合日常体验",
    features: ["每月 1M tokens", "全部模型可用", "社区支持"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "¥39",
    pricePeriod: "/月",
    tagline: "开发者首选",
    features: ["每月 10M tokens", "全部模型可用", "优先模型分配"],
    highlighted: true,
  },
  {
    id: "pro-plus",
    name: "Pro+",
    price: "¥99",
    pricePeriod: "/月",
    tagline: "重度使用者",
    features: ["每月 50M tokens", "全部模型可用", "优先客服支持"],
  },
];

const TOKEN_RATE_NOTES = [
  { label: "DeepSeek V4 系列", rate: "1×" },
  { label: "Kimi K2.6", rate: "2×" },
  { label: "Claude Sonnet 4.6", rate: "5×" },
  { label: "Claude Opus 4.7", rate: "20×" },
];

function PricingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <HomeHeader />
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight">选择适合你的套餐</h1>
          <p className="mt-3 text-muted-foreground">
            所有模型都可使用，仅 token 配额不同。Token 按模型实际成本等比扣减。
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <PricingTierCard key={tier.id} tier={tier} onUpgrade={() => setModalOpen(true)} />
          ))}
        </div>

        <div className="mt-20 rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold">Token 计费说明</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            实际扣减 = (input + output) × 模型倍率。倍率仅作用于扣账，不限制可用模型。
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            {TOKEN_RATE_NOTES.map((note) => (
              <li key={note.label} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">{note.label}</span>
                <span className="font-medium tabular-nums">{note.rate}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <WechatQrModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  component: PricingPage,
});
