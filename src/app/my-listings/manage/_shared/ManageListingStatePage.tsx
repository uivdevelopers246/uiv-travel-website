import { Header } from "@/components/layout/header";

type Props = {
  title: string;
  message: string;
};

export function ManageListingStatePage({ title, message }: Props) {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-white px-6 pt-32 pb-16 text-[#193059]">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
        </div>
      </div>
    </>
  );
}
