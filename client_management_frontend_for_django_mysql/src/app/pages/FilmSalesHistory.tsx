import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Film, Search, Trash2, Calendar, Package, Plus, User, RefreshCcw } from "lucide-react";
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
import { type BackendSale, deleteSaleApi, fetchSalesApi } from "../utils/api";

interface FilmSale {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  saleDate: string;
  soldBy?: string;
}

function parseAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function mapBackendSale(sale: BackendSale | Record<string, any>): FilmSale {
  const title = sale.title ?? sale.designation ?? sale.name ?? "Produit";
  const quantity = parseAmount(sale.quantity ?? 0);
  const unitPrice = parseAmount(sale.unit_price ?? sale.unitPrice ?? 0);
  const totalPrice = parseAmount(sale.total_price ?? sale.totalPrice ?? quantity * unitPrice);
  const saleDate = String(sale.sold_at ?? sale.saleDate ?? sale.created_at ?? new Date().toISOString());

  return {
    id: String(sale.id),
    designation: String(title),
    quantity,
    unitPrice,
    totalPrice,
    saleDate,
    soldBy: sale.sold_by_username ?? sale.soldBy ?? sale.sold_by ?? undefined,
  };
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

  const fetchFilmSales = async () => {
    try {
      const response = await fetchSalesApi();
      const rows = Array.isArray(response)
        ? response
        : Array.isArray((response as any)?.results)
          ? (response as any).results
          : [];

      setFilmSales(rows.map(mapBackendSale));
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors du chargement de l'historique des achats");
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        await fetchFilmSales();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredSales = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...filmSales]
      .filter((sale) => {
        if (!query) return true;
        return (
          sale.designation.toLowerCase().includes(query) ||
          String(sale.quantity).includes(query) ||
          String(sale.totalPrice).includes(query) ||
          (sale.soldBy || "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
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
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : filteredSales.map((sale) => sale.id));
  };

  const toggleSelectSale = (saleId: string) => {
    setSelectedIds((prev) => (prev.includes(saleId) ? prev.filter((id) => id !== saleId) : [...prev, saleId]));
  };

  const reloadSales = async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      await fetchFilmSales();
      toast.success("Historique des achats actualisé");
    } finally {
      setLoading(false);
    }
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
      toast.success(`${selectedIds.length} achat(s) supprimé(s)`);
      setSelectedIds([]);
      await fetchFilmSales();
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de la suppression");
    } finally {
      setProcessing(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Date inconnue";

    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => `${Number(amount || 0).toLocaleString("fr-FR")} Ar`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Film className="w-8 h-8 text-purple-600" />
            Historique des achats produits
          </h1>
          <p className="text-gray-600 mt-1">Films, séries, cache écran, dos et accessoires vendus</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={reloadSales} variant="outline" disabled={loading || processing} className="flex items-center gap-2">
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button onClick={() => navigate("/sales")} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4" />
            Nouvelle vente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Achats enregistrés</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-gray-900">{stats.count}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Transactions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-gray-900">{stats.transactionsCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Quantité totale</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-gray-900">{stats.totalQuantity}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-gray-600">Revenu produits</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-purple-600">{formatCurrency(stats.totalRevenue)}</div></CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher par produit, vendeur, quantité ou montant..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIds([]);
                }}
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
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Achats produits ({filteredSales.length})</CardTitle>
            {isAdmin && filteredSales.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleSelectAll} />
                <span className="text-sm text-gray-600">Tout sélectionner</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600">Chargement de l'historique...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">Aucun achat produit enregistré</p>
              <Button onClick={() => navigate("/sales")} variant="outline" className="mt-4">
                Enregistrer une vente
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-600">
                    {isAdmin && <th className="w-10 p-3" />}
                    <th className="p-3 font-semibold">Produit</th>
                    <th className="p-3 font-semibold text-right">Quantité</th>
                    <th className="p-3 font-semibold text-right">Prix unitaire</th>
                    <th className="p-3 font-semibold text-right">Total</th>
                    <th className="p-3 font-semibold">Vendeur</th>
                    <th className="p-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-b last:border-0 hover:bg-gray-50">
                      {isAdmin && (
                        <td className="p-3 align-middle">
                          <Checkbox checked={selectedIds.includes(sale.id)} onCheckedChange={() => toggleSelectSale(sale.id)} />
                        </td>
                      )}
                      <td className="p-3 align-middle font-semibold text-gray-900">{sale.designation}</td>
                      <td className="p-3 align-middle text-right text-gray-900">{sale.quantity}</td>
                      <td className="p-3 align-middle text-right text-gray-900">{formatCurrency(sale.unitPrice)}</td>
                      <td className="p-3 align-middle text-right font-bold text-purple-600">{formatCurrency(sale.totalPrice)}</td>
                      <td className="p-3 align-middle text-gray-700">
                        {sale.soldBy ? (
                          <span className="inline-flex items-center gap-1"><User className="w-4 h-4" />{sale.soldBy}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 align-middle text-gray-700">
                        <span className="inline-flex items-center gap-1"><Calendar className="w-4 h-4" />{formatDate(sale.saleDate)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer {selectedIds.length} achat(s) produit ? Cette action est irréversible.
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
