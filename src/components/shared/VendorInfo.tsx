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
    <div className="bg-gray-50 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-[#193059] mb-4">Hosted By</h2>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[#407FC2] rounded-full flex items-center justify-center text-white font-bold text-lg">
          {vendor.name?.charAt(0) || "V"}
        </div>
        <div>
          <p className="font-semibold text-[#193059]">{vendor.name || "Vendor"}</p>
          {vendor.contact_email && (
            <p className="text-sm text-gray-500">{vendor.contact_email}</p>
          )}
        </div>
      </div>
      {vendor.business_phone && (
        <div className="mt-4 flex items-center gap-2 text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          <span>{vendor.business_phone}</span>
        </div>
      )}
    </div>
  );
}
