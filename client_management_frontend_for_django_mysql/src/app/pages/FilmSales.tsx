import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Film, Plus, Save, Trash2, ListVideo, Tv, Globe, Sparkles, Smartphone, Shield } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { createSaleApi } from "../utils/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

interface FilmSaleItem {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

const iconMap: Record<string, any> = { Film, Tv, Globe, Sparkles, Shield, Smartphone };

function createEmptyItem(index = 0): FilmSaleItem {
  return {
    id: `item-${Date.now()}-${index}`,
    designation: "",
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
  };
}

function emptyItems() {
  return Array.from({ length: 5 }, (_, i) => createEmptyItem(i));
}

export function FilmSales() {
  const { fetchStatistics, settings } = useApp();
  const navigate = useNavigate();

  const DESIGNATION_OPTIONS = (settings.products || []).map((product) => ({
    value: product.name,
    label: product.name,
    icon: iconMap[product.icon] || Film,
    defaultPrice: Number(product.defaultPrice) || 0,
  }));

  const [items, setItems] = useState<FilmSaleItem[]>(emptyItems);
  const [saving, setSaving] = useState(false);

  const formatAr = (amount: number) => `${Number(amount || 0).toLocaleString()} Ar`;

  const handleItemChange = (id: string, field: keyof FilmSaleItem, value: string | number) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== id) return item;

        let designation = item.designation;
        let quantity = item.quantity;
        let unitPrice = item.unitPrice;

        if (field === "designation") {
          designation = String(value);
          const selectedProduct = DESIGNATION_OPTIONS.find((opt) => opt.value === designation);

          if (selectedProduct) {
            unitPrice = selectedProduct.defaultPrice;
            quantity = quantity > 0 ? quantity : 1;
          } else {
            unitPrice = 0;
          }
        }

        if (field === "quantity") {
          quantity = Math.max(0, Number(value) || 0);
        }

        if (field === "unitPrice") {
          unitPrice = Math.max(0, Number(value) || 0);
        }

        return {
          ...item,
          designation,
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
        };
      })
    );
  };

  const addNewRow = () => {
    setItems((prevItems) => [...prevItems, createEmptyItem(prevItems.length)]);
  };

  const removeRow = (id: string) => {
    if (items.length <= 1) {
      toast.error("Vous devez avoir au moins une ligne");
      return;
    }
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const calculateGrandTotal = () => items.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleSubmit = async () => {
    const validItems = items.filter(
      (item) => item.designation.trim() !== "" && item.quantity > 0 && item.unitPrice > 0
    );

    if (validItems.length === 0) {
      toast.error("Veuillez remplir au moins une ligne valide");
      return;
    }

    setSaving(true);
    try {
      await createSaleApi(validItems);
      toast.success("Vente enregistrée avec succès");
      setItems(emptyItems());
      await fetchStatistics();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Film className="w-8 h-8 text-purple-600" />
            Vente de produits
          </h1>
          <p className="text-gray-600 mt-1">Films, séries, cache écran et accessoires</p>
        </div>
        <Button onClick={() => navigate("/sales-history")} variant="outline" className="flex items-center gap-2">
          <ListVideo className="w-4 h-4" />
          Voir l'historique
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle vente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-12 gap-4 font-semibold text-sm text-gray-700 pb-2 border-b">
              <div className="col-span-5">Produit</div>
              <div className="col-span-2">Quantité</div>
              <div className="col-span-2">Prix unitaire</div>
              <div className="col-span-2">Prix total</div>
              <div className="col-span-1">Action</div>
            </div>

            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-5">
                    <Select
                      value={item.designation}
                      onValueChange={(value) => handleItemChange(item.id, "designation", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un produit" />
                      </SelectTrigger>
                      <SelectContent>
                        {DESIGNATION_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          return (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4" />
                                <span>{option.label}</span>
                                <span className="ml-2 text-xs text-gray-500">
                                  {formatAr(option.defaultPrice)}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, "quantity", parseInt(e.target.value, 10) || 0)}
                    />
                  </div>

                  <div className="col-span-2">
                    <Input
                      type="text"
                      value={item.unitPrice > 0 ? formatAr(item.unitPrice) : ""}
                      readOnly
                      className="bg-gray-50"
                    />
                  </div>

                  <div className="col-span-2">
                    <Input
                      type="text"
                      value={formatAr(item.totalPrice)}
                      readOnly
                      className="bg-gray-50 font-semibold"
                    />
                  </div>

                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(item.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t">
              <Button variant="outline" onClick={addNewRow} className="w-full border-dashed">
                <Plus className="w-4 h-4 mr-2" />
                Ajouter une ligne
              </Button>
            </div>

            <div className="pt-4 border-t">
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-semibold text-gray-900">Total général</span>
                <span className="text-2xl font-bold text-purple-600">
                  {formatAr(calculateGrandTotal())}
                </span>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                size="lg"
              >
                {saving ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Valider la vente
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
