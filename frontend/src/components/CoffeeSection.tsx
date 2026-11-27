"use client";

const COFFEE_3D_URL =
  "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hot%20beverage/3D/hot_beverage_3d.png";

export function CoffeeSection() {
  return (
    <section className="animate-tab">
      <div className="clay-peach grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center gap-4">
            <div className="clay flex h-20 w-20 shrink-0 items-center justify-center !rounded-3xl p-2.5">
              <img src={COFFEE_3D_URL} alt="3D Coffee Cup" className="h-14 w-14 object-contain" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 shadow-sm">
                Support the Project
              </span>
              <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Buy Us a Coffee
              </h2>
            </div>
          </div>

          <p className="max-w-xl text-sm leading-7 text-slate-700 sm:text-base">
            SyntaxGraph runs on shared cloud infrastructure built by the SyntaxGraph Team. If this platform saved you
            time exploring a codebase or reviewing changes, scan the QR code to support us and buy us a coffee.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1 text-xs font-semibold text-amber-900">
            <span className="rounded-full bg-white/75 px-3.5 py-1.5 shadow-sm">Supports Server Hosting</span>
            <span className="rounded-full bg-white/75 px-3.5 py-1.5 shadow-sm">Works with Any UPI App</span>
          </div>
        </div>

        <div className="flex flex-col items-center lg:col-span-5">
          <div className="clay-card flex flex-col items-center p-5">
            <div className="overflow-hidden rounded-[20px] bg-black p-2 shadow-inner">
              <img
                src="/coffee-qr.jpg"
                alt="Scan UPI QR code to support SyntaxGraph Team"
                className="h-52 w-52 rounded-[14px] object-contain sm:h-56 sm:w-56"
              />
            </div>
            <p className="mt-3.5 text-xs font-bold text-slate-800">Scan to Support &amp; Buy Us a Coffee</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">PhonePe · GPay · Paytm · Any UPI</p>
          </div>
        </div>
      </div>
    </section>
  );
}
