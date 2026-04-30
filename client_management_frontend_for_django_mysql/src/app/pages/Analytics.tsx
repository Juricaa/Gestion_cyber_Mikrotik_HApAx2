import { useState, useMemo, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { CalendarIcon, TrendingUp, DollarSign, Clock, Wifi, Gamepad2 } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "../components/ui/utils";

export function Analytics() {
  const { fetchStatistics, statistics, loading } = useApp();
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Fetch statistics when date range changes
  useEffect(() => {
    const startDate = dateRange.from ? startOfDay(dateRange.from).toISOString() : undefined;
    const endDate = dateRange.to ? endOfDay(dateRange.to).toISOString() : undefined;
    fetchStatistics(startDate, endDate);
  }, [dateRange, fetchStatistics]);

  const dailyRevenue = useMemo(() => {
    if (!statistics?.sessions) return [];

    const grouped: Record<string, number> = {};
    statistics.sessions
      .filter((s) => s.status === "terminated" && s.totalCost)
      .forEach((s) => {
        const date = format(new Date(s.startTime), "dd MMM", { locale: fr });
        grouped[date] = (grouped[date] || 0) + s.totalCost!;
      });

    return Object.entries(grouped)
      .map(([date, revenue]) => ({ date, revenue }))
      .slice(-7); // Last 7 days
  }, [statistics]);

  const serviceTypeData = useMemo(() => {
    if (!statistics?.sessions) return [];

    const wifi = statistics.sessions.filter((s) => s.serviceType === "wifi").length;
    const console = statistics.sessions.filter((s) => s.serviceType === "console").length;

    return [
      { name: "Wifi", value: wifi, color: "#3b82f6" },
      { name: "Console", value: console, color: "#a855f7" },
    ];
  }, [statistics]);

  const sessionTypeData = useMemo(() => {
    if (!statistics?.sessions) return [];

    const open = statistics.sessions.filter((s) => s.sessionType === "open").length;
    const countdown = statistics.sessions.filter((s) => s.sessionType === "countdown").length;

    return [
      { name: "Ouvert", value: open },
      { name: "Compte à rebours", value: countdown },
    ];
  }, [statistics]);

  const avgSessionDuration = useMemo(() => {
    if (!statistics?.completedSessions || statistics.completedSessions === 0) return 0;
    const totalDuration = statistics.sessions
      .filter((s) => s.status === "terminated")
      .reduce((sum, s) => sum + s.elapsedTime, 0);
    return Math.round(totalDuration / statistics.completedSessions);
  }, [statistics]);

  const clearDateRange = () => {
    setDateRange({ from: undefined, to: undefined });
  };

  if (loading && !statistics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">Analyses détaillées et statistiques avancées</p>
      </div>

      {/* Date range picker */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <Label className="mb-2 block">Période d'analyse</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full sm:w-[300px] justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd MMM yyyy", { locale: fr })} -{" "}
                          {format(dateRange.to, "dd MMM yyyy", { locale: fr })}
                        </>
                      ) : (
                        format(dateRange.from, "dd MMM yyyy", { locale: fr })
                      )
                    ) : (
                      <span>Sélectionner une plage de dates</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    locale={fr}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {(dateRange.from || dateRange.to) && (
              <Button variant="outline" onClick={clearDateRange} className="sm:mt-7">
                Réinitialiser
              </Button>
            )}
            <div className="sm:mt-7 text-sm text-gray-500">
              {dateRange.from || dateRange.to ? (
                <span className="text-blue-600 font-medium">Filtré</span>
              ) : (
                <span>Toutes les périodes</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenu total
            </CardTitle>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {statistics?.totalRevenue.toLocaleString() || 0} Ar
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Sur {statistics?.totalSessions || 0} sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Sessions terminées
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {statistics?.completedSessions || 0}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {statistics?.activeSessions || 0} en cours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Durée moyenne
            </CardTitle>
            <Clock className="w-5 h-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{avgSessionDuration} min</div>
            <p className="text-sm text-gray-500 mt-1">Par session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenu moyen
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {statistics?.completedSessions
                ? Math.round(statistics.totalRevenue / statistics.completedSessions).toLocaleString()
                : 0}{" "}
              Ar
            </div>
            <p className="text-sm text-gray-500 mt-1">Par session</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily revenue chart */}
        {dailyRevenue.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Revenus des 7 derniers jours</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => `${value.toLocaleString()} Ar`} />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Service type distribution */}
        {serviceTypeData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Répartition par type de service</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={serviceTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {serviceTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session type distribution */}
        {sessionTypeData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Modes de session</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sessionTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Revenue by service type */}
        <Card>
          <CardHeader>
            <CardTitle>Revenus par service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Wifi</p>
                    <p className="text-sm text-gray-500">
                      {statistics?.sessions.filter((s) => s.serviceType === "wifi").length || 0} sessions
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600">
                    {(statistics?.revenueByService.wifi || 0).toLocaleString()} Ar
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Gamepad2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Console</p>
                    <p className="text-sm text-gray-500">
                      {statistics?.sessions.filter((s) => s.serviceType === "console").length || 0} sessions
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-purple-600">
                    {(statistics?.revenueByService.console || 0).toLocaleString()} Ar
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
