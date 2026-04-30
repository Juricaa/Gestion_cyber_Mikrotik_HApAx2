import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Wifi, Gamepad2, DollarSign, Clock, ShoppingBag, Plus, Trash2, Film, Tv, Globe, Sparkles, Shield, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Product } from "../types";


const iconMap: Record<string, any> = {
  Film,
  Tv,
  Globe,
  Sparkles,
  Shield,
  Smartphone,
};

export function Settings() {
  const { settings, updateSettings } = useApp();
  const [loading, setLoading] = useState(false);

  const [wifiHourlyRate, setWifiHourlyRate] = useState(settings.rates.wifi.hourlyRate);
  const [wifiMinCharge, setWifiMinCharge] = useState(settings.rates.wifi.minCharge);
  const [consoleHourlyRate, setConsoleHourlyRate] = useState(settings.rates.console.hourlyRate);
  const [consoleMinCharge, setConsoleMinCharge] = useState(settings.rates.console.minCharge);
  const [products, setProducts] = useState<Product[]>(settings.products || []);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState(0);
  const [newProductIcon, setNewProductIcon] = useState("Film");

  useEffect(() => {
  setWifiHourlyRate(settings.rates.wifi.hourlyRate);
  setWifiMinCharge(settings.rates.wifi.minCharge);
  setConsoleHourlyRate(settings.rates.console.hourlyRate);
  setConsoleMinCharge(settings.rates.console.minCharge);
  setProducts(settings.products || []);
}, [settings]);

  const handleSave = async () => {
    if (
      wifiHourlyRate <= 0 ||
      wifiMinCharge <= 0 ||
      consoleHourlyRate <= 0 ||
      consoleMinCharge <= 0
    ) {
      toast.error("Tous les tarifs doivent être supérieurs à 0");
      return;
    }

    // Validate products
    for (const product of products) {
      if (!product.name.trim()) {
        toast.error("Tous les produits doivent avoir un nom");
        return;
      }
      if (product.defaultPrice <= 0) {
        toast.error("Tous les prix doivent être supérieurs à 0");
        return;
      }
    }

    setLoading(true);

    try {
      await updateSettings({
        ...settings,
        rates: {
          wifi: {
            hourlyRate: wifiHourlyRate,
            minCharge: wifiMinCharge,
          },
          console: {
            hourlyRate: consoleHourlyRate,
            minCharge: consoleMinCharge,
          },
        },
        products,
      });

      toast.success("Paramètres enregistrés avec succès");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Erreur lors de l'enregistrement des paramètres");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setWifiHourlyRate(settings.rates.wifi.hourlyRate);
    setWifiMinCharge(settings.rates.wifi.minCharge);
    setConsoleHourlyRate(settings.rates.console.hourlyRate);
    setConsoleMinCharge(settings.rates.console.minCharge);
    setProducts(settings.products || []);
    toast.info("Modifications annulées");
  };

  const handleAddProduct = () => {
    if (!newProductName.trim()) {
      toast.error("Veuillez saisir un nom de produit");
      return;
    }
    if (newProductPrice <= 0) {
      toast.error("Le prix doit être supérieur à 0");
      return;
    }

    const newProduct: Product = {
      name: newProductName.trim(),
      defaultPrice: newProductPrice,
      icon: newProductIcon,
    };

    setProducts([...products, newProduct]);
    setNewProductName("");
    setNewProductPrice(0);
    setNewProductIcon("Film");
    toast.success(`Produit "${newProduct.name}" ajouté`);
  };

  const handleUpdateProduct = (index: number, field: keyof Product, value: string | number) => {
    const updatedProducts = [...products];
    updatedProducts[index] = { ...updatedProducts[index], [field]: value };
    setProducts(updatedProducts);
  };

  const handleDeleteProduct = (index: number) => {
    const productName = products[index].name;
    setProducts(products.filter((_, i) => i !== index));
    toast.success(`Produit "${productName}" supprimé`);
  };

  const hasChanges =
    wifiHourlyRate !== settings.rates.wifi.hourlyRate ||
    wifiMinCharge !== settings.rates.wifi.minCharge ||
    consoleHourlyRate !== settings.rates.console.hourlyRate ||
    consoleMinCharge !== settings.rates.console.minCharge ||
    JSON.stringify(products) !== JSON.stringify(settings.products || []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-600 mt-1">Configuration des tarifs du cyber café</p>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* Wifi rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Wifi className="w-5 h-5 text-blue-600" />
              </div>
              Tarifs Wifi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wifi-hourly" className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  Tarif horaire (Ar/heure)
                </Label>
                <Input
                  id="wifi-hourly"
                  type="number"
                  min="0"
                  value={wifiHourlyRate}
                  onChange={(e) => setWifiHourlyRate(Number(e.target.value))}
                  placeholder="Ex: 500"
                />
                <p className="text-sm text-gray-500">
                  Prix facturé par heure d'utilisation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wifi-min" className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  Tarif minimal (Ar)
                </Label>
                <Input
                  id="wifi-min"
                  type="number"
                  min="0"
                  value={wifiMinCharge}
                  onChange={(e) => setWifiMinCharge(Number(e.target.value))}
                  placeholder="Ex: 100"
                />
                <p className="text-sm text-gray-500">
                  Montant minimum à facturer
                </p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Exemple de calcul :</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 30 min → {Math.max(Math.ceil((30 / 60) * wifiHourlyRate), wifiMinCharge)} Ar (tarif minimal appliqué)</li>
                <li>• 1 heure → {Math.ceil(wifiHourlyRate)} Ar</li>
                <li>• 2 heures → {Math.ceil(2 * wifiHourlyRate)} Ar</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Console rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Gamepad2 className="w-5 h-5 text-purple-600" />
              </div>
              Tarifs Console
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="console-hourly" className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  Tarif horaire (Ar/heure)
                </Label>
                <Input
                  id="console-hourly"
                  type="number"
                  min="0"
                  value={consoleHourlyRate}
                  onChange={(e) => setConsoleHourlyRate(Number(e.target.value))}
                  placeholder="Ex: 1000"
                />
                <p className="text-sm text-gray-500">
                  Prix facturé par heure d'utilisation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="console-min" className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  Tarif minimal (Ar)
                </Label>
                <Input
                  id="console-min"
                  type="number"
                  min="0"
                  value={consoleMinCharge}
                  onChange={(e) => setConsoleMinCharge(Number(e.target.value))}
                  placeholder="Ex: 200"
                />
                <p className="text-sm text-gray-500">
                  Montant minimum à facturer
                </p>
              </div>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="font-medium text-purple-900 mb-2">Exemple de calcul :</h4>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• 30 min → {Math.max(Math.ceil((30 / 60) * consoleHourlyRate), consoleMinCharge)} Ar (tarif minimal appliqué)</li>
                <li>• 1 heure → {Math.ceil(consoleHourlyRate)} Ar</li>
                <li>• 2 heures → {Math.ceil(2 * consoleHourlyRate)} Ar</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Product Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-green-600" />
              </div>
              Gestion des Produits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product list */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Produits existants</Label>
              {products.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">Aucun produit. Ajoutez-en ci-dessous.</p>
              ) : (
                <div className="space-y-2">
                  {products.map((product, index) => {
                    const Icon = iconMap[product.icon] || Film;
                    return (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                        <div className="flex items-center gap-2 flex-1">
                          <Icon className="w-5 h-5 text-gray-600" />
                          <Input
                            value={product.name}
                            onChange={(e) => handleUpdateProduct(index, "name", e.target.value)}
                            className="flex-1"
                            placeholder="Nom du produit"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={product.defaultPrice}
                            onChange={(e) => handleUpdateProduct(index, "defaultPrice", Number(e.target.value))}
                            className="w-32"
                            placeholder="Prix"
                          />
                          <span className="text-sm text-gray-600">Ar</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteProduct(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add new product */}
            <div className="pt-4 border-t">
              <Label className="text-base font-semibold mb-3 block">Ajouter un nouveau produit</Label>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="new-product-name">Nom du produit</Label>
                  <Input
                    id="new-product-name"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="Ex: Écouteur, Clé USB..."
                  />
                </div>
                <div className="w-40 space-y-2">
                  <Label htmlFor="new-product-price">Prix par défaut (Ar)</Label>
                  <Input
                    id="new-product-price"
                    type="number"
                    min="0"
                    value={newProductPrice || ""}
                    onChange={(e) => setNewProductPrice(Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
                <Button
                  onClick={handleAddProduct}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-medium text-green-900 mb-2">💡 À propos des produits :</h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Les produits apparaissent automatiquement dans la page "Ventes produits"</li>
                <li>• Le prix par défaut est auto-rempli lors de la saisie d'une vente</li>
                <li>• Vous pouvez modifier le prix lors de chaque vente si nécessaire</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {hasChanges && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-blue-900">
                    Vous avez des modifications non enregistrées
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    Enregistrez vos modifications ou annulez-les
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={loading}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loading ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="pt-6">
            <h4 className="font-medium text-gray-900 mb-2">
              ℹ️ À propos des tarifs
            </h4>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>
                • <strong>Tarif horaire :</strong> Le prix est calculé proportionnellement au temps
                d'utilisation (ex: 30 min = 0.5 × tarif horaire)
              </li>
              <li>
                • <strong>Tarif minimal :</strong> Le montant minimum facturé, même si le calcul
                donne un prix inférieur
              </li>
              <li>
                • Les tarifs s'appliquent immédiatement aux nouvelles sessions
              </li>
              <li>
                • Les sessions en cours conservent les anciens tarifs jusqu'à leur terminaison
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
