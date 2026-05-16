import { ExternalLink } from "lucide-react";

interface ShowcaseItem {
  slug: string;
  title: string;
  description: string;
  image: string;
}

const SHOWCASE: ShowcaseItem[] = [
  {
    slug: "5hJMZDF4IFI",
    title: "SaaS Monitoring Dashboard",
    description: "深色主题 · KPI 卡片 · 实时折线图",
    image: "/showcase/66e176af.png",
  },
  {
    slug: "1Fm_ZEi3Z4I",
    title: "Developer Portfolio",
    description: "Hero 打字动画 · 项目展示",
    image: "/showcase/63c506ed.png",
  },
  {
    slug: "v5Pv9ZZiCf0",
    title: "Lumen AI Pricing",
    description: "三档定价 · 月/年切换 · FAQ",
    image: "/showcase/158e3487.png",
  },
];

export function ShowcaseGallery() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div className="motion-safe:animate-[fadeIn_0.6s_ease-out_both] mb-10 text-center">
        <h2 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
          Built with code-artisan
        </h2>
        <p className="mx-auto mt-2 max-w-2xl font-body text-sm text-muted-foreground md:text-base">
          A few apps users built in one prompt — click to see the chat that built them.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {SHOWCASE.map((item, i) => (
          <li
            key={item.slug}
            className="motion-safe:animate-[fadeIn_0.6s_ease-out_both]"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <a
              href={`/s/${item.slug}`}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="aspect-[16/10] overflow-hidden bg-muted">
                <img
                  src={item.image}
                  alt={item.title}
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-sm font-medium">{item.title}</h3>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
