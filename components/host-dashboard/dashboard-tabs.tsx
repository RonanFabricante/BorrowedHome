"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface DashboardTabsProps {
  activeTab: string;
}

const tabs = [
  { id: "requests", label: "Requests" },
  { id: "bookings", label: "Bookings" },
  { id: "calendar", label: "Calendar" },
  { id: "earnings", label: "Earnings" },
];

export function DashboardTabs({ activeTab }: DashboardTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/host/dashboard?${params.toString()}`);
  };

  return (
    <div className="border-b border-slate-200 sticky top-0 bg-white z-10">
      <nav className="flex space-x-8" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              role="tab"
              aria-selected={isActive}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                isActive
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
