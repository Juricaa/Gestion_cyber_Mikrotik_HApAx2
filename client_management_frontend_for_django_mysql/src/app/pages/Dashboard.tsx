import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Monitor, Wifi, Gamepad2, DollarSign, TrendingUp, Clock, Calendar, Film, Tv, Globe, Sparkles, Shield, Smartphone } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import { ServerStatusCheck } from "../components/ServerStatusCheck";

export function Dashboard() {
  const { statistics, loading, fetchStatistics } = useApp();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtering, setFiltering] = useState(false);

  // Initialize with current month
  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    setStartDate(firstDay.toISOString().split("T")[0]);
    setEndDate(lastDay.toISOString().split("T")[0]);
  }, []);

  const handleFilterByDate = async () => {
    if (!startDate || !endDate) {
      toast.error("Veuillez sélectionner les deux dates");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error("La date de début doit être antérieure à la date de fin");
      return;
    }

    setFiltering(true);
    try {
      await fetchStatistics(startDate, endDate);
      toast.success("Statistiques filtrées avec succès");
    } catch (error) {
      console.error("Error filtering statistics:", error);
      toast.error("Erreur lors du filtrage des statistiques");
    } finally {
      setFiltering(false);
    }
  };

  const handleResetFilter = async () => {
    setFiltering(true);
    try {
      await fetchStatistics();
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate(lastDay.toISOString().split("T")[0]);
      toast.success("Filtre réinitialisé");
    } catch (error) {
      console.error("Error resetting filter:", error);
      toast.error("Erreur lors de la réinitialisation");
    } finally {
      setFiltering(false);
    }
  };

  const stats = useMemo(() => {
    if (!statistics) {
      return {
        activeSessions: 0,
        totalSessions: 0,
        completedSessions: 0,
        totalRevenue: 0,
        todayRevenue: 0,
      };
    }

    // Calculate today's revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessions = statistics.sessions.filter((s) => {
      const sessionDate = new Date(s.startTime);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime() && s.status === "terminated";
    });
    const todayRevenue = todaySessions.reduce((sum, s) => sum + (s.totalCost || 0), 0);

    return {
      activeSessions: statistics.activeSessions,
      totalSessions: statistics.totalSessions,
      completedSessions: statistics.completedSessions,
      totalRevenue: statistics.totalRevenue,
      todayRevenue,
    };
  }, [statistics]);

  const recentSessions = useMemo(() => {
    if (!statistics?.sessions) return [];
    return [...statistics.sessions]
      .filter((s) => s.status === "terminated")
      .sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())
      .slice(0, 5);
  }, [statistics]);

  const revenueByServiceData = useMemo(() => {
    if (!statistics?.revenueByService) return [];

    const labelMap: { [key: string]: string } = {
      wifi: "Wifi",
      console: "Console",
      Film: "Film",
      Série: "Série",
      Gasy: "Gasy",
      Animé: "Animé",
      "Cache écran": "Cache écran",
      Dos: "Dos",
    };

    return Object.entries(statistics.revenueByService).map(([type, revenue]) => ({
      name: labelMap[type] || type,
      value: revenue,
    }));
  }, [statistics]);

  const COLORS = [
    "#3b82f6",  // Wifi - blue
    "#a855f7",  // Console - purple
    "#9333ea",  // Film - violet
    "#2563eb",  // Série - blue
    "#16a34a",  // Gasy - green
    "#ec4899",  // Animé - pink
    "#f97316",  // Cache écran - orange
    "#06b6d4",  // Dos - cyan
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-600 mt-1">Vue d'ensemble de votre cyber café</p>
      </div>

      {/* Server status check */}
      <ServerStatusCheck />

      {/* Date filter */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Filtrer les statistiques par période
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="startDate" className="text-sm font-medium mb-2 block">
                Date de début
              </Label>
              <Input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={handleFilterByDate}
                disabled={filtering}
                className="bg-blue-600 hover:bg-blue-700 flex-1"
              >
                {filtering ? "Filtrage..." : "Filtrer"}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetFilter}
                disabled={filtering}
              >
                Réinitialiser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Sessions actives
            </CardTitle>
            <Monitor className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeSessions}</div>
            <p className="text-sm text-gray-500 mt-1">En cours maintenant</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Sessions terminées
            </CardTitle>
            <Clock className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.completedSessions}</div>
            <p className="text-sm text-gray-500 mt-1">Au total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenu du jour
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.todayRevenue.toLocaleString()}
            </div>
            <p className="text-sm text-gray-500 mt-1">Ar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenu total
            </CardTitle>
            <DollarSign className="w-5 h-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.totalRevenue.toLocaleString()}
            </div>
            <p className="text-sm text-gray-500 mt-1">Ar</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by service type */}
        {revenueByServiceData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Revenus par service</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={revenueByServiceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {revenueByServiceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `${value.toLocaleString()} Ar`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Quick stats */}
        <Card>
          <CardHeader>
            <CardTitle>Statistiques rapides</CardTitle>
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
                    <p className="text-sm text-gray-500">Sessions</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600">
                    {statistics?.sessions.filter((s) => s.serviceType === "wifi").length || 0}
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
                    <p className="text-sm text-gray-500">Sessions</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-purple-600">
                    {statistics?.sessions.filter((s) => s.serviceType === "console").length || 0}
                  </p>
                </div>
              </div>

              {/* Revenue by designation */}
              {statistics?.revenueByDesignation && Object.keys(statistics.revenueByDesignation).length > 0 && (
                <>
                  {statistics.revenueByDesignation["Film"] && (
                    <div className="flex items-center justify-between p-4 bg-violet-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                          <Film className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Film</p>
                          <p className="text-sm text-gray-500">Revenu</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-violet-600">
                          {statistics.revenueByDesignation["Film"].toLocaleString()} Ar
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.revenueByDesignation["Série"] && (
                    <div className="flex items-center justify-between p-4 bg-sky-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
                          <Tv className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Série</p>
                          <p className="text-sm text-gray-500">Revenu</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-sky-600">
                          {statistics.revenueByDesignation["Série"].toLocaleString()} Ar
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.revenueByDesignation["Gasy"] && (
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Globe className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Gasy</p>
                          <p className="text-sm text-gray-500">Revenu</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          {statistics.revenueByDesignation["Gasy"].toLocaleString()} Ar
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.revenueByDesignation["Animé"] && (
                    <div className="flex items-center justify-between p-4 bg-pink-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-pink-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Animé</p>
                          <p className="text-sm text-gray-500">Revenu</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-pink-600">
                          {statistics.revenueByDesignation["Animé"].toLocaleString()} Ar
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.revenueByDesignation["Cache écran"] && (
                    <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                          <Shield className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Cache écran</p>
                          <p className="text-sm text-gray-500">Revenu</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-orange-600">
                          {statistics.revenueByDesignation["Cache écran"].toLocaleString()} Ar
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.revenueByDesignation["Dos"] && (
                    <div className="flex items-center justify-between p-4 bg-cyan-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
                          <Smartphone className="w-5 h-5 text-cyan-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Dos</p>
                          <p className="text-sm text-gray-500">Revenu</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-cyan-600">
                          {statistics.revenueByDesignation["Dos"].toLocaleString()} Ar
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <Clock className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Durée moyenne</p>
                    <p className="text-sm text-gray-500">Par session</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {statistics?.completedSessions
                      ? Math.round(
                          statistics.sessions
                            .filter((s) => s.status === "terminated")
                            .reduce((sum, s) => sum + s.elapsedTime, 0) /
                            statistics.completedSessions
                        )
                      : 0}
                  </p>
                  <p className="text-sm text-gray-500">min</p>
                </div>
              </div>

              {/* Film sales stats */}
              {statistics?.totalRevenue !== undefined && statistics.totalRevenue > 0 && (
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <Film className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Ventes</p>
                      <p className="text-sm text-gray-500">Revenu total</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-purple-600">
                      {statistics.totalRevenue.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">Ar</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Sessions récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Aucune session terminée pour le moment
            </p>
          ) : (
            <div className="space-y-4">
              {recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {session.serviceType === "wifi" ? (
                      <Wifi className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Gamepad2 className="w-5 h-5 text-purple-600" />
                    )}
                    <div>
                      <p className="font-medium">{session.clientName}</p>
                      <p className="text-sm text-gray-500">{session.serviceName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {session.totalCost?.toLocaleString()} Ar
                    </p>
                    <p className="text-sm text-gray-500">{session.elapsedTime} min</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}