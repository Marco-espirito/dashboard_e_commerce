import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { api } from "../lib/api";
import { formatPrice } from "../lib/format";

type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
type ChartPeriod = "YEAR" | "FIRST_2" | "LAST_2" | "CUSTOM" | "ALL";

interface Stats {
  revenueTotal: number;
  ordersCount: number;
  avgBasket: number;
  productsCount: number;
  revenueByMonth: { month: string; revenue: number }[];
  topProducts: { name: string; sold: number; revenue: number }[];
  lowStock: { id: string; name: string; stock: number }[];
  recentOrders: {
    id: string; customer: string; total: number; status: OrderStatus; createdAt: string;
  }[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "En attente", PAID: "Payée", SHIPPED: "Expédiée",
  DELIVERED: "Livrée", CANCELLED: "Annulée",
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-indigo-50 text-indigo-700",
  SHIPPED: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const CHART_PERIOD_OPTIONS: { value: ChartPeriod; label: string }[] = [
  { value: "YEAR", label: "Janvier a decembre" },
  { value: "FIRST_2", label: "2 premiers mois" },
  { value: "LAST_2", label: "2 derniers mois" },
  { value: "CUSTOM", label: "Periode personnalisee" },
  { value: "ALL", label: "Toute la periode" },
];

function formatMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("YEAR");
  const [selectedYear, setSelectedYear] = useState("");
  const [customStartMonth, setCustomStartMonth] = useState("");
  const [customEndMonth, setCustomEndMonth] = useState("");

  useEffect(() => {
    api<Stats>("/stats/overview")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (error || !stats) return <p className="text-sm text-red-600">{error || "Aucune donnée"}</p>;

  const kpis = [
    { label: "Chiffre d'affaires", value: formatPrice(stats.revenueTotal) },
    { label: "Commandes", value: stats.ordersCount.toString() },
    { label: "Panier moyen", value: formatPrice(stats.avgBasket) },
    { label: "Produits", value: stats.productsCount.toString() },
  ];

  const monthOptions = stats.revenueByMonth;
  const firstMonth = monthOptions[0]?.month ?? "";
  const lastMonth = monthOptions[monthOptions.length - 1]?.month ?? "";
  const yearOptions = Array.from(
    new Set(monthOptions.map((m) => m.month.slice(0, 4)))
  );
  const selectedYearValue =
    selectedYear || yearOptions[yearOptions.length - 1] || "";
  const customStart = customStartMonth || firstMonth;
  const customEnd = customEndMonth || lastMonth;
  const customStartIndex = monthOptions.findIndex((m) => m.month === customStart);
  const customEndIndex = monthOptions.findIndex((m) => m.month === customEnd);
  const rangeStartIndex = Math.min(
    customStartIndex === -1 ? 0 : customStartIndex,
    customEndIndex === -1 ? monthOptions.length - 1 : customEndIndex
  );
  const rangeEndIndex = Math.max(
    customStartIndex === -1 ? 0 : customStartIndex,
    customEndIndex === -1 ? monthOptions.length - 1 : customEndIndex
  );

  const selectedRevenueByMonth =
    chartPeriod === "FIRST_2"
      ? monthOptions.slice(0, 2)
      : chartPeriod === "LAST_2"
        ? monthOptions.slice(-2)
        : chartPeriod === "CUSTOM"
          ? monthOptions.slice(rangeStartIndex, rangeEndIndex + 1)
          : chartPeriod === "ALL"
            ? monthOptions
            : monthOptions.filter((m) => m.month.startsWith(selectedYearValue));

  const selectedPeriodLabel =
    selectedRevenueByMonth.length > 0
      ? `${formatMonth(selectedRevenueByMonth[0].month)} - ${formatMonth(
          selectedRevenueByMonth[selectedRevenueByMonth.length - 1].month
        )}`
      : "Aucune donnee";

  const chartData = selectedRevenueByMonth.map((m) => ({
    mois: formatMonth(m.month),
    ca: Math.round(m.revenue / 100),
  }));
  const formatTooltipValue = (value: unknown) => [
    `${Number(value ?? 0)} EUR`,
    "CA",
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-slate-500">Vue d'ensemble de ta boutique.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{k.label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Graphique */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Chiffre d'affaires
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Periode affichee : {selectedPeriodLabel}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={chartPeriod}
              onChange={(e) => setChartPeriod(e.target.value as ChartPeriod)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {CHART_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {chartPeriod === "YEAR" && (
              <select
                value={selectedYearValue}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    Annee : {year}
                  </option>
                ))}
              </select>
            )}

            {chartPeriod === "CUSTOM" && (
              <>
                <select
                  value={customStart}
                  onChange={(e) => setCustomStartMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {monthOptions.map((month) => (
                    <option key={month.month} value={month.month}>
                      Debut : {formatMonth(month.month)}
                    </option>
                  ))}
                </select>
                <select
                  value={customEnd}
                  onChange={(e) => setCustomEndMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 outline-none transition hover:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {monthOptions.map((month) => (
                    <option key={month.month} value={month.month}>
                      Fin : {formatMonth(month.month)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="mois" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={formatTooltipValue}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Bar dataKey="ca" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top produits + Stock faible */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Top produits</h2>
          <ul className="mt-4 space-y-3">
            {stats.topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">
                    {i + 1}
                  </span>
                  <span className="text-slate-700">{p.name}</span>
                </span>
                <span className="text-right">
                  <span className="font-medium text-slate-900">{formatPrice(p.revenue)}</span>
                  <span className="ml-2 text-xs text-slate-400">{p.sold} vendus</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Stock faible</h2>
          {stats.lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Tous les stocks sont confortables.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stats.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{p.name}</span>
                  <span className={
                    p.stock <= 5
                      ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                      : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                  }>
                    {p.stock} restants
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Commandes récentes */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Commandes récentes</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Client</th>
              <th className="px-6 py-3 font-medium">Montant</th>
              <th className="px-6 py-3 font-medium">Statut</th>
              <th className="px-6 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.recentOrders.map((o) => (
              <tr key={o.id}>
                <td className="px-6 py-3 font-medium text-slate-900">{o.customer}</td>
                <td className="px-6 py-3 text-slate-700">{formatPrice(o.total)}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[o.status]}`}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
