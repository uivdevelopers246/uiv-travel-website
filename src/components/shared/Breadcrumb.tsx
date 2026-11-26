import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
};

export function Breadcrumb({ items }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-[#dbe7f2] bg-[linear-gradient(180deg,#f8fbff_0%,#eef5fb_100%)] pt-24 pb-3 sm:pb-5">
      <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_top_left,rgba(64,127,194,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(251,202,26,0.2),transparent_28%)]" />
      <div className="container mx-auto px-4 max-w-7xl">
        <nav className="relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs text-slate-500 shadow-[0_12px_30px_rgba(25,48,89,0.08)] backdrop-blur-sm sm:flex-wrap sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
          {items.map((item, index) => (
            <span key={index} className={`flex items-center gap-1.5 sm:gap-2 ${item.href ? "shrink-0" : "min-w-0"}`}>
              {index > 0 && <span className="text-slate-300">/</span>}
              {item.href ? (
                <Link href={item.href} className="transition-colors hover:text-[#407FC2]">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate font-semibold text-[#193059] sm:whitespace-normal">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}
