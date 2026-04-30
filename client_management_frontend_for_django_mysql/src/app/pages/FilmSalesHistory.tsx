import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Film, Search, Trash2, Calendar, Package, Plus, User } from "lucide-react";
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
import { deleteSaleApi, fetchSalesApi } from "../utils/api";

interface FilmSale {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  saleDate: string;
  soldBy?: string;
}

export function FilmSalesHistory() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [filmSales, setFilmSales] = useState<FilmSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const load = async () => {
      await fetchFilmSales();
      setLoading(false);
    };
    load();
  }, []);

  const fetchFilmSales = async () => {
    try {
      const data = await fetchSalesApi();
      const mapped: FilmSale[] = data.map((sale) => ({
        id: String(sale.id),
        designation: sale.title,
        quantity: Number(sale.quantity || 0),
        unitPrice: Number(sale.unit_price || 0),
        totalPrice: Number(sale.total_price || 0),
        saleDate: sale.sold_at,
        soldBy: sale.sold_by_username,
      }));
      setFilmSales(mapped);
    } catch (error: any) {
      toast.error(error.message || "Erreur lors du chargement des ventes");
    }
  };

  const filteredSales = useMemo(() => {
    let filtered = [...filmSales];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (sale) =>
          sale.designation.toLowerCase().includes(query) ||
          (sale.soldBy || "").toLowerCase().includes(query),
      );
    }
    return filtered.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [filmSales, searchQuery]);

  const stats = useMemo(() => {
    const totalRevenue = filmSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
    const totalQuantity = filmSales.reduce((sum, sale) => sum + sale.quantity, 0);
    return {
      count: filmSales.length,
      totalRevenue,
      totalQuantity,
      transactionsCount: filmSales.length,
    };
  }, [filmSales]);

  const allSelected = filteredSales.length > 0 && selectedIds.length === filteredSales.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < filteredSales.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : filteredSales.map((sale) => sale.id));
  };

  const toggleSelectSale = (saleId: string) => {
    setSelectedIds((prev) => (prev.includes(saleId) ? prev.filter((id) => id !== saleId) : [...prev, saleId]));
  };

  const handleDeleteSelected = async () => {
    if (!isAdmin) {
      toast.error("Seuls les administrateurs peuvent supprimer des ventes");
      return;
    }
    if (selectedIds.length === 0) return;

    setProcessing(true);
    try {
      await Promise.all(selectedIds.map((id) => deleteSaleApi(id)));
      toast.success(`${selectedIds.length} vente(s) supprimée(s)`);
      setSelectedIds([]);
      await fetchFilmSales();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la suppression");
    } finally {
      setProcessing(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatCurrency = (amount: number) => amount.toLocaleString("fr-FR") + " Ar";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Film className="w-8 h-8 text-purple-600" />
            Historique des ventes
          </h1>
          <p className="text-gray-600 mt-1">Films, séries, cache écran et accessoires</p>
        </div>
        <Button onClick={() => navigate("/sales")} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4" />
          Nouvelle vente
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Total ventes</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900">{stats.count}</div></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Transactions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900">{stats.transactionsCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Quantité totale</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900">{stats.totalQuantity}</div></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Revenu total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-purple-600">{formatCurrency(stats.totalRevenue)}</div></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher par désignation ou vendeur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {isAdmin && selectedIds.length > 0 && (
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={processing}>
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer ({selectedIds.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ventes ({filteredSales.length})</CardTitle>
            {isAdmin && filteredSales.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} className={someSelected ? "data-[state=checked]:bg-gray-400" : ""} />
                <span className="text-sm text-gray-600">Tout sélectionner</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12"><div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div><p className="text-gray-600">Chargement...</p></div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12"><Package className="w-16 h-16 text-gray-300 mx-auto mb-4" /><p className="text-gray-600">Aucune vente enregistrée</p></div>
          ) : (
            <div className="space-y-4">
              {filteredSales.map((sale) => (
                <div key={sale.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start gap-4">
                    {isAdmin && (
                      <Checkbox checked={selectedIds.includes(sale.id)} onCheckedChange={() => toggleSelectSale(sale.id)} />
                    )}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Désignation</p>
                        <p className="font-semibold text-gray-900">{sale.designation}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Quantité</p>
                        <p className="font-medium text-gray-900">{sale.quantity}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Prix unitaire</p>
                        <p className="font-medium text-gray-900">{formatCurrency(sale.unitPrice)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Prix total</p>
                        <p className="font-bold text-purple-600">{formatCurrency(sale.totalPrice)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 flex items-center gap-1"><Calendar className="w-4 h-4" />Date</p>
                        <p className="font-medium text-gray-900">{formatDate(sale.saleDate)}</p>
                        {sale.soldBy && (
                          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1"><User className="w-4 h-4" />{sale.soldBy}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer {selectedIds.length} vente(s) ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected} disabled={processing} className="bg-red-600 hover:bg-red-700">
              {processing ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
