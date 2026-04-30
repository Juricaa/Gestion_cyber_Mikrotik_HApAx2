import { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Wifi, Gamepad2, Search, Trash2, Filter, ArchiveRestore, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

export function Archives() {
  const { sessions, unarchiveSessions, deleteSessions } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<"all" | "wifi" | "console">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionType, setActionType] = useState<"unarchive" | "delete" | null>(null);
  const [processing, setProcessing] = useState(false);

  const archivedSessions = useMemo(() => {
    let filtered = sessions.filter((s) => s.archived === true);

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.clientName.toLowerCase().includes(query) ||
          s.serviceName.toLowerCase().includes(query)
      );
    }

    // Filter by service type
    if (serviceFilter !== "all") {
      filtered = filtered.filter((s) => s.serviceType === serviceFilter);
    }

    // Sort by end time (most recent first)
    return filtered.sort((a, b) => {
      const aTime = a.endTime ? new Date(a.endTime).getTime() : 0;
      const bTime = b.endTime ? new Date(b.endTime).getTime() : 0;
      return bTime - aTime;
    });
  }, [sessions, searchQuery, serviceFilter]);

  const stats = useMemo(() => {
    const totalRevenue = archivedSessions.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const totalDuration = archivedSessions.reduce((sum, s) => sum + s.elapsedTime, 0);
    return {
      count: archivedSessions.length,
      totalRevenue,
      avgRevenue: archivedSessions.length > 0 ? totalRevenue / archivedSessions.length : 0,
      totalDuration,
    };
  }, [archivedSessions]);

  const allSelected = archivedSessions.length > 0 && selectedIds.length === archivedSessions.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < archivedSessions.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(archivedSessions.map((s) => s.id));
    }
  };

  const toggleSelectSession = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async () => {
    if (!actionType || selectedIds.length === 0) return;

    setProcessing(true);
    try {
      if (actionType === "unarchive") {
        await unarchiveSessions(selectedIds);
        toast.success(`${selectedIds.length} session(s) restaurée(s)`);
      } else if (actionType === "delete") {
        await deleteSessions(selectedIds);
        toast.success(`${selectedIds.length} session(s) supprimée(s)`);
      }
      setSelectedIds([]);
      setActionType(null);
    } catch (error) {
      console.error("Error performing bulk action:", error);
      toast.error("Erreur lors de l'opération");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Archives</h1>
        <p className="text-gray-600 mt-1">Sessions archivées</p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-900">{stats.count}</div>
            <p className="text-sm text-gray-500">Sessions archivées</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {stats.totalRevenue.toLocaleString()} Ar
            </div>
            <p className="text-sm text-gray-500">Revenu total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {Math.round(stats.avgRevenue).toLocaleString()} Ar
            </div>
            <p className="text-sm text-gray-500">Revenu moyen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(stats.totalDuration / 60)}h
            </div>
            <p className="text-sm text-gray-500">Durée totale</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Rechercher par nom de client ou service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Type de service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les services</SelectItem>
                <SelectItem value="wifi">Wifi uniquement</SelectItem>
                <SelectItem value="console">Console uniquement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <Card className="mb-6 border-blue-500 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">
                  {selectedIds.length} session(s) sélectionnée(s)
                </span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => setActionType("unarchive")}
                  className="flex-1 sm:flex-none"
                >
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                  Restaurer
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setActionType("delete")}
                  className="flex-1 sm:flex-none"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions list */}
      {archivedSessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucune session archivée
            </h3>
            <p className="text-gray-500">
              {searchQuery || serviceFilter !== "all"
                ? "Essayez de modifier vos filtres"
                : "Les sessions archivées apparaîtront ici"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sessions archivées ({archivedSessions.length})</CardTitle>
              {archivedSessions.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    id="select-all"
                    className={someSelected ? "data-[state=checked]:bg-blue-600" : ""}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Tout sélectionner
                  </label>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {archivedSessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                    selectedIds.includes(session.id)
                      ? "bg-blue-50 border-2 border-blue-500"
                      : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                  }`}
                >
                  <Checkbox
                    checked={selectedIds.includes(session.id)}
                    onCheckedChange={() => toggleSelectSession(session.id)}
                    id={`session-${session.id}`}
                  />

                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        session.serviceType === "wifi" ? "bg-blue-100" : "bg-purple-100"
                      }`}
                    >
                      {session.serviceType === "wifi" ? (
                        <Wifi className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Gamepad2 className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium text-gray-900 truncate">{session.clientName}</p>
                        <Badge variant="outline" className="text-xs">
                          {session.serviceName}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        {new Date(session.startTime).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        • {session.elapsedTime} min
                        {session.sessionType === "countdown" && (
                          <span className="ml-2 text-blue-600">
                            (Prévu: {session.plannedDuration} min)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-gray-900">
                      {session.totalCost?.toLocaleString()} Ar
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.serviceType === "wifi" ? "Wifi" : "Console"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk action confirmation dialog */}
      <AlertDialog open={!!actionType} onOpenChange={() => setActionType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "unarchive" ? "Restaurer les sessions ?" : "Supprimer les sessions ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "unarchive" ? (
                <>
                  {selectedIds.length} session(s) sera(ont) restaurée(s) et réapparaîtra(ont)
                  dans l'historique.
                </>
              ) : (
                <>
                  Cette action est irréversible. {selectedIds.length} session(s) sera(ont)
                  définitivement supprimée(s) de la base de données.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkAction}
              disabled={processing}
              className={
                actionType === "delete"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }
            >
              {processing
                ? "Traitement..."
                : actionType === "unarchive"
                  ? "Restaurer"
                  : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
