type Vendor = {
  id: string;
  name: string | null;
  contact_email: string | null;
  business_phone: string | null;
};

type Props = {
  vendor: Vendor;
};

export function VendorInfo({ vendor }: Props) {
  return (
    <div className="rounded-[28px] border border-[#d9e6f1] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9fd_100%)] p-6 shadow-[0_24px_60px_rgba(25,48,89,0.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#407FC2]">
        Hosted By
      </p>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#407FC2] to-[#193059] text-lg font-bold text-white shadow-[0_12px_24px_rgba(25,48,89,0.18)]">
          {vendor.name?.charAt(0) || "V"}
        </div>
        <div>
          <p className="text-lg font-semibold text-[#193059]">{vendor.name || "Vendor"}</p>
          {vendor.contact_email && (
            <p className="text-sm text-slate-500">{vendor.contact_email}</p>
          )}
        </div>
      </div>
      {vendor.business_phone && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#dbe7f2] bg-white px-4 py-3 text-slate-600">
          <svg className="h-5 w-5 text-[#407FC2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          <span className="font-medium">{vendor.business_phone}</span>
        </div>
      )}
    </div>
  );
}
