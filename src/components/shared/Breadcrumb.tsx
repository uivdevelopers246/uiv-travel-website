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
    <section className="relative overflow-hidden border-b border-[#dbe7f2] bg-[linear-gradient(180deg,#f8fbff_0%,#eef5fb_100%)] pt-24 pb-5">
      <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_top_left,rgba(64,127,194,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(251,202,26,0.2),transparent_28%)]" />
      <div className="container mx-auto px-4 max-w-7xl">
        <nav className="relative inline-flex flex-wrap items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm text-slate-500 shadow-[0_12px_30px_rgba(25,48,89,0.08)] backdrop-blur-sm">
          {items.map((item, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span className="text-slate-300">/</span>}
              {item.href ? (
                <Link href={item.href} className="transition-colors hover:text-[#407FC2]">
                  {item.label}
                </Link>
              ) : (
                <span className="font-semibold text-[#193059]">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}
