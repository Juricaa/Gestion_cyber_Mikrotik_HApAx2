import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  DollarSign,
  Gamepad2,
  ReceiptText,
  Save,
  ShoppingBag,
  TrendingUp,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { useApp } from "../context/AppContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ServerStatusCheck } from "../components/ServerStatusCheck";
import { fetchCashReconciliationsApi, saveCashReconciliationApi } from "../utils/api";
import type { DailyCashReconciliation, DailyRevenueRow } from "../types";

function formatCurrency(value: number | null | undefined) {
  return `${Math.round(Number(value || 0)).toLocaleString("fr-FR")} Ar`;
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) return dateKey;

  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function currentMonthRange() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return {
    start: `${firstDay.getFullYear()}-${pad2(firstDay.getMonth() + 1)}-${pad2(firstDay.getDate())}`,
    end: `${lastDay.getFullYear()}-${pad2(lastDay.getMonth() + 1)}-${pad2(lastDay.getDate())}`,
  };
}

function buildEmptyDailyRow(date: string): DailyRevenueRow {
  return {
    date,
    label: formatDateLabel(date),
    wifiRevenue: 0,
    consoleRevenue: 0,
    productRevenue: 0,
    totalAppRevenue: 0,
    actualAmount: null,
    difference: null,
    sessionCount: 0,
    wifiSessionCount: 0,
    consoleSessionCount: 0,
    saleCount: 0,
    productBreakdown: {},
  };
}

export function Dashboard() {
  const { statistics, loading, fetchStatistics } = useApp();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [reconciliations, setReconciliations] = useState<DailyCashReconciliation[]>([]);
  const [draftVersements, setDraftVersements] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (start?: string, end?: string) => {
      setFiltering(true);

      try {
        const [cashRows] = await Promise.all([
          fetchCashReconciliationsApi(start, end),
          fetchStatistics(start, end),
        ]);

        setReconciliations(cashRows);
        setDraftVersements((current) => {
          const next = { ...current };
          cashRows.forEach((row) => {
            next[row.date] = String(Math.round(row.actualAmount));
          });
          return next;
        });
        setDraftNotes((current) => {
          const next = { ...current };
          cashRows.forEach((row) => {
            next[row.date] = row.note || "";
          });
          return next;
        });
      } catch (error) {
        console.error("Erreur chargement dashboard:", error);
        toast.error("Impossible de charger le tableau de bord");
      } finally {
        setFiltering(false);
      }
    },
    [fetchStatistics]
  );

  useEffect(() => {
    const range = currentMonthRange();
    setStartDate(range.start);
    setEndDate(range.end);
    void loadDashboard(range.start, range.end);
  }, [loadDashboard]);

  const handleFilterByDate = async () => {
    if (!startDate || !endDate) {
      toast.error("Veuillez sélectionner les deux dates");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error("La date de début doit être antérieure à la date de fin");
      return;
    }

    await loadDashboard(startDate, endDate);
    toast.success("Tableau de bord mis à jour");
  };

  const handleResetFilter = async () => {
    const range = currentMonthRange();
    setStartDate(range.start);
    setEndDate(range.end);
    await loadDashboard(range.start, range.end);
    toast.success("Filtre réinitialisé sur le mois en cours");
  };

  const reconciliationByDate = useMemo(() => {
    return new Map(reconciliations.map((row) => [row.date, row]));
  }, [reconciliations]);

  const dailyRows = useMemo(() => {
    const rows = new Map<string, DailyRevenueRow>();

    (statistics?.dailyRevenue || []).forEach((row) => {
      rows.set(row.date, { ...row });
    });

    reconciliations.forEach((cashRow) => {
      if (!rows.has(cashRow.date)) {
        rows.set(cashRow.date, buildEmptyDailyRow(cashRow.date));
      }
    });

    return Array.from(rows.values())
      .map((row) => {
        const cashRow = reconciliationByDate.get(row.date);
        const actualAmount = cashRow ? cashRow.actualAmount : null;

        return {
          ...row,
          actualAmount,
          difference: actualAmount == null ? null : actualAmount - row.totalAppRevenue,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reconciliationByDate, reconciliations, statistics?.dailyRevenue]);

  const totals = useMemo(() => {
    const totalAppRevenue = dailyRows.reduce((sum, row) => sum + row.totalAppRevenue, 0);
    const totalActualAmount = dailyRows.reduce(
      (sum, row) => sum + (row.actualAmount == null ? 0 : row.actualAmount),
      0
    );
    const wifiRevenue = dailyRows.reduce((sum, row) => sum + row.wifiRevenue, 0);
    const consoleRevenue = dailyRows.reduce((sum, row) => sum + row.consoleRevenue, 0);
    const productRevenue = dailyRows.reduce((sum, row) => sum + row.productRevenue, 0);
    const missingVersements = dailyRows.filter((row) => row.actualAmount == null).length;
    const daysWithDifference = dailyRows.filter(
      (row) => row.actualAmount != null && Math.round(row.difference || 0) !== 0
    ).length;

    return {
      totalAppRevenue,
      totalActualAmount,
      difference: totalActualAmount - totalAppRevenue,
      wifiRevenue,
      consoleRevenue,
      productRevenue,
      missingVersements,
      daysWithDifference,
      sessionCount: dailyRows.reduce((sum, row) => sum + row.sessionCount, 0),
      saleCount: dailyRows.reduce((sum, row) => sum + row.saleCount, 0),
    };
  }, [dailyRows]);

  const chartData = useMemo(() => {
    return [...dailyRows]
      .reverse()
      .map((row) => ({
        date: row.date.slice(5),
        "App web": Math.round(row.totalAppRevenue),
        "Versement réel": row.actualAmount == null ? 0 : Math.round(row.actualAmount),
      }));
  }, [dailyRows]);

  const handleSaveVersement = async (row: DailyRevenueRow) => {
    const draftValue = draftVersements[row.date] ?? "";
    const actualAmount = parseMoneyInput(draftValue);

    if (!Number.isFinite(actualAmount)) {
      toast.error("Montant versement invalide");
      return;
    }

    const existing = reconciliationByDate.get(row.date);
    setSavingDate(row.date);

    try {
      const saved = await saveCashReconciliationApi({
        id: existing?.id,
        date: row.date,
        actualAmount,
        note: draftNotes[row.date] || "",
      });

      setReconciliations((current) => {
        const withoutCurrent = current.filter((item) => item.date !== saved.date);
        return [...withoutCurrent, saved].sort((a, b) => b.date.localeCompare(a.date));
      });

      setDraftVersements((current) => ({
        ...current,
        [saved.date]: String(Math.round(saved.actualAmount)),
      }));
      setDraftNotes((current) => ({
        ...current,
        [saved.date]: saved.note || "",
      }));

      toast.success("Versement réel enregistré");
    } catch (error) {
      console.error("Erreur enregistrement versement:", error);
      toast.error("Impossible d'enregistrer le versement");
    } finally {
      setSavingDate(null);
    }
  };

  if (loading && !statistics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord caisse</h1>
          <p className="text-gray-600 mt-1">
            Compare l'argent calculé par l'app web avec le versement réel de chaque journée.
          </p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">État du rapprochement</p>
          {totals.missingVersements > 0 ? (
            <p className="mt-1 flex items-center gap-2 font-semibold text-amber-700">
              <AlertTriangle className="w-4 h-4" /> {totals.missingVersements} jour(s) à compléter
            </p>
          ) : totals.daysWithDifference > 0 ? (
            <p className="mt-1 flex items-center gap-2 font-semibold text-red-700">
              <AlertTriangle className="w-4 h-4" /> {totals.daysWithDifference} écart(s) à vérifier
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-2 font-semibold text-green-700">
              <CheckCircle2 className="w-4 h-4" /> App web = versement réel
            </p>
          )}
        </div>
      </div>

      <ServerStatusCheck />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" /> Période à analyser
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="startDate" className="text-sm font-medium mb-2 block">
                Date de début
              </Label>
              <Input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-sm font-medium mb-2 block">
                Date de fin
              </Label>
              <Input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleFilterByDate} disabled={filtering} className="bg-blue-600 hover:bg-blue-700 flex-1">
                {filtering ? "Chargement..." : "Analyser"}
              </Button>
              <Button variant="outline" onClick={handleResetFilter} disabled={filtering}>
                Mois actuel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total app web</CardTitle>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{formatCurrency(totals.totalAppRevenue)}</div>
            <p className="text-sm text-gray-500 mt-1">WiFi + console + ventes produits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Versement réel saisi</CardTitle>
            <ReceiptText className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{formatCurrency(totals.totalActualAmount)}</div>
            <p className="text-sm text-gray-500 mt-1">Montant reçu physiquement</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Écart caisse</CardTitle>
            <TrendingUp className="w-5 h-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${Math.round(totals.difference) === 0 ? "text-green-700" : "text-red-700"}`}>
              {formatCurrency(totals.difference)}
            </div>
            <p className="text-sm text-gray-500 mt-1">Versement réel - app web</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Activité</CardTitle>
            <CheckCircle2 className="w-5 h-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">
              {totals.sessionCount + totals.saleCount}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {totals.sessionCount} sessions / {totals.saleCount} ventes
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>App web vs versement réel par jour</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: unknown) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="App web" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Versement réel" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-gray-500">Aucune donnée pour cette période.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition de l'argent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-blue-50 p-4">
              <div className="flex items-center gap-3">
                <Wifi className="w-5 h-5 text-blue-700" />
                <div>
                  <p className="font-semibold text-gray-900">Sessions WiFi</p>
                  <p className="text-sm text-gray-500">Tickets / vouchers payés</p>
                </div>
              </div>
              <p className="font-bold text-blue-700">{formatCurrency(totals.wifiRevenue)}</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-purple-50 p-4">
              <div className="flex items-center gap-3">
                <Gamepad2 className="w-5 h-5 text-purple-700" />
                <div>
                  <p className="font-semibold text-gray-900">Sessions console</p>
                  <p className="text-sm text-gray-500">Temps console facturé</p>
                </div>
              </div>
              <p className="font-bold text-purple-700">{formatCurrency(totals.consoleRevenue)}</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-orange-50 p-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-5 h-5 text-orange-700" />
                <div>
                  <p className="font-semibold text-gray-900">Autres ventes</p>
                  <p className="text-sm text-gray-500">Film, série, gasy, accessoires...</p>
                </div>
              </div>
              <p className="font-bold text-orange-700">{formatCurrency(totals.productRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détail journalier et contrôle du versement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 text-right font-semibold">App web</th>
                  <th className="p-3 text-right font-semibold">Versement réel</th>
                  <th className="p-3 text-right font-semibold">Écart</th>
                  <th className="p-3 font-semibold">Détails argent</th>
                  <th className="p-3 font-semibold">Note</th>
                  <th className="p-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      Aucune session ou vente trouvée pour cette période.
                    </td>
                  </tr>
                ) : (
                  dailyRows.map((row) => {
                    const difference = row.actualAmount == null ? null : row.actualAmount - row.totalAppRevenue;
                    const hasDifference = difference != null && Math.round(difference) !== 0;

                    return (
                      <tr key={row.date} className="border-b last:border-0 align-top hover:bg-gray-50/70">
                        <td className="p-3">
                          <p className="font-semibold text-gray-900">{row.label}</p>
                          <p className="text-xs text-gray-500">{row.date}</p>
                        </td>
                        <td className="p-3 text-right font-bold text-blue-700">{formatCurrency(row.totalAppRevenue)}</td>
                        <td className="p-3">
                          <Input
                            className="ml-auto w-36 text-right"
                            inputMode="decimal"
                            placeholder="0"
                            value={draftVersements[row.date] ?? ""}
                            onChange={(event) =>
                              setDraftVersements((current) => ({
                                ...current,
                                [row.date]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="p-3 text-right">
                          {difference == null ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                              À saisir
                            </span>
                          ) : (
                            <span className={`font-bold ${hasDifference ? "text-red-700" : "text-green-700"}`}>
                              {formatCurrency(difference)}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="space-y-1 text-gray-700">
                            <p>
                              WiFi: <span className="font-semibold">{formatCurrency(row.wifiRevenue)}</span> ({row.wifiSessionCount})
                            </p>
                            <p>
                              Console: <span className="font-semibold">{formatCurrency(row.consoleRevenue)}</span> ({row.consoleSessionCount})
                            </p>
                            <p>
                              Produits: <span className="font-semibold">{formatCurrency(row.productRevenue)}</span> ({row.saleCount})
                            </p>
                            {Object.keys(row.productBreakdown).length > 0 && (
                              <p className="text-xs text-gray-500">
                                {Object.entries(row.productBreakdown)
                                  .map(([name, amount]) => `${name}: ${formatCurrency(amount)}`)
                                  .join(" • ")}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Input
                            placeholder="ex: manque 2 000 Ar, erreur rendu monnaie..."
                            value={draftNotes[row.date] ?? ""}
                            onChange={(event) =>
                              setDraftNotes((current) => ({
                                ...current,
                                [row.date]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => handleSaveVersement(row)}
                            disabled={savingDate === row.date}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Save className="mr-2 h-4 w-4" />
                            {savingDate === row.date ? "..." : "Enregistrer"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
