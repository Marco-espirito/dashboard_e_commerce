import { useSearchParams } from "react-router-dom";
import { SessionsPage } from "./SessionsPage";
import { SecurityPage } from "./SecurityPage";

type SettingsTab = "sessions" | "securite";

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "sessions", label: "Sessions" },
  { value: "securite", label: "Securite" },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "sessions" || value === "securite";
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("onglet");
  const activeTab: SettingsTab = isSettingsTab(tabParam) ? tabParam : "sessions";

  function changeTab(tab: SettingsTab) {
    setSearchParams({ onglet: tab });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Parametres</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gere les sessions connectees et les options de securite du compte.
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => changeTab(tab.value)}
              className={
                activeTab === tab.value
                  ? "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                  : "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "sessions" ? <SessionsPage /> : <SecurityPage />}
    </div>
  );
}
