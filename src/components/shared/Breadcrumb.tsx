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
    <section className="bg-gray-50 pt-24 pb-4">
      <div className="container mx-auto px-4 max-w-7xl">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          {items.map((item, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span>/</span>}
              {item.href ? (
                <Link href={item.href} className="hover:text-[#407FC2]">
                  {item.label}
                </Link>
              ) : (
                <span className="text-[#193059] font-medium">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}
