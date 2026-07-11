import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Wifi, Gamepad2, DollarSign, Clock, ShoppingBag, Plus, Trash2, Film, Tv, Globe, Sparkles, Shield, Smartphone, Router, Eye, EyeOff, PlugZap, RotateCcw, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MikroTikConfiguration, Product } from "../types";
import { getMikroTikConfiguration, resetMikroTikConfiguration, saveMikroTikConfiguration, testMikroTikConnection } from "../utils/api";


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

  const [mikrotikConfig, setMikrotikConfig] = useState<MikroTikConfiguration | null>(null);
  const [mikrotikBaseUrl, setMikrotikBaseUrl] = useState("");
  const [mikrotikUsername, setMikrotikUsername] = useState("");
  const [mikrotikPassword, setMikrotikPassword] = useState("");
  const [mikrotikEnabled, setMikrotikEnabled] = useState(false);
  const [mikrotikVerifySsl, setMikrotikVerifySsl] = useState(false);
  const [mikrotikHotspotProfile, setMikrotikHotspotProfile] = useState("paid_wifi");
  const [showMikrotikPassword, setShowMikrotikPassword] = useState(false);
  const [mikrotikLoading, setMikrotikLoading] = useState(true);
  const [mikrotikSaving, setMikrotikSaving] = useState(false);
  const [mikrotikTesting, setMikrotikTesting] = useState(false);

  useEffect(() => {
  setWifiHourlyRate(settings.rates.wifi.hourlyRate);
  setWifiMinCharge(settings.rates.wifi.minCharge);
  setConsoleHourlyRate(settings.rates.console.hourlyRate);
  setConsoleMinCharge(settings.rates.console.minCharge);
  setProducts(settings.products || []);
}, [settings]);

  const applyMikroTikConfiguration = (config: MikroTikConfiguration) => {
    setMikrotikConfig(config);
    setMikrotikBaseUrl(config.baseUrl);
    setMikrotikUsername(config.username);
    setMikrotikPassword("");
    setMikrotikEnabled(config.enabled);
    setMikrotikVerifySsl(config.verifySsl);
    setMikrotikHotspotProfile(config.hotspotProfile || "paid_wifi");
  };

  useEffect(() => {
    let active = true;

    getMikroTikConfiguration()
      .then((config) => {
        if (active) applyMikroTikConfiguration(config);
      })
      .catch((error) => {
        console.error("Error loading MikroTik settings:", error);
        if (active) toast.error(error instanceof Error ? error.message : "Impossible de charger la configuration MikroTik");
      })
      .finally(() => {
        if (active) setMikrotikLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const mikrotikPayload = () => ({
    baseUrl: mikrotikBaseUrl.trim(),
    username: mikrotikUsername.trim(),
    password: mikrotikPassword,
    enabled: mikrotikEnabled,
    verifySsl: mikrotikVerifySsl,
    hotspotProfile: mikrotikHotspotProfile.trim() || "paid_wifi",
  });

  const handleSaveMikroTik = async () => {
    setMikrotikSaving(true);
    try {
      const saved = await saveMikroTikConfiguration(mikrotikPayload());
      applyMikroTikConfiguration(saved);
      toast.success("Configuration MikroTik enregistrée");
    } catch (error) {
      console.error("Error saving MikroTik settings:", error);
      toast.error(error instanceof Error ? error.message : "Erreur pendant l'enregistrement MikroTik");
    } finally {
      setMikrotikSaving(false);
    }
  };

  const handleTestMikroTik = async () => {
    setMikrotikTesting(true);
    try {
      const router = await testMikroTikConnection(mikrotikPayload());
      const details = [router.identity, router.boardName, router.version ? `RouterOS ${router.version}` : ""]
        .filter(Boolean)
        .join(" · ");
      toast.success(`Connexion réussie : ${details}`);
    } catch (error) {
      console.error("Error testing MikroTik connection:", error);
      toast.error(error instanceof Error ? error.message : "Connexion MikroTik impossible");
    } finally {
      setMikrotikTesting(false);
    }
  };

  const handleResetMikroTikToEnv = async () => {
    if (!window.confirm("Supprimer la configuration web et réutiliser les variables du fichier .env ?")) return;

    setMikrotikSaving(true);
    try {
      const config = await resetMikroTikConfiguration();
      applyMikroTikConfiguration(config);
      toast.success("Configuration .env réactivée");
    } catch (error) {
      console.error("Error resetting MikroTik settings:", error);
      toast.error(error instanceof Error ? error.message : "Impossible de réactiver la configuration .env");
    } finally {
      setMikrotikSaving(false);
    }
  };

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
        <p className="text-gray-600 mt-1">Configuration du routeur, des tarifs et des produits</p>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* MikroTik configuration */}
        <Card className="border-cyan-200">
          <CardHeader>
            <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <span className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <Router className="w-5 h-5 text-cyan-700" />
                </span>
                Connexion au routeur MikroTik
              </span>
              {mikrotikConfig && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  mikrotikConfig.source === "database"
                    ? "bg-cyan-100 text-cyan-800"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  Source : {mikrotikConfig.source === "database" ? "application web" : "fichier .env"}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {mikrotikLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement de la configuration…
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-cyan-50 border border-cyan-200">
                  <div>
                    <p className="font-medium text-cyan-950">Synchronisation Hotspot</p>
                    <p className="text-sm text-cyan-800">
                      Active la création et la gestion des vouchers sur le routeur.
                    </p>
                  </div>
                  <Switch checked={mikrotikEnabled} onCheckedChange={setMikrotikEnabled} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="mikrotik-base-url">Adresse IP ou URL du routeur</Label>
                    <Input
                      id="mikrotik-base-url"
                      value={mikrotikBaseUrl}
                      onChange={(event) => setMikrotikBaseUrl(event.target.value)}
                      placeholder="192.168.88.1 ou http://192.168.88.1/rest"
                      autoComplete="off"
                    />
                    <p className="text-xs text-gray-500">
                      Le chemin <code>/rest</code> est ajouté automatiquement quand vous saisissez uniquement l'IP.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mikrotik-username">Nom d'utilisateur</Label>
                    <Input
                      id="mikrotik-username"
                      value={mikrotikUsername}
                      onChange={(event) => setMikrotikUsername(event.target.value)}
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mikrotik-password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="mikrotik-password"
                        type={showMikrotikPassword ? "text" : "password"}
                        value={mikrotikPassword}
                        onChange={(event) => setMikrotikPassword(event.target.value)}
                        placeholder={mikrotikConfig?.passwordConfigured ? "Laisser vide pour conserver le mot de passe" : "Mot de passe du routeur"}
                        className="pr-10"
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowMikrotikPassword((value) => !value)}
                        aria-label={showMikrotikPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showMikrotikPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    {mikrotikConfig?.passwordConfigured && !mikrotikPassword && (
                      <p className="text-xs text-emerald-700">Un mot de passe est déjà configuré.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mikrotik-profile">Profil Hotspot</Label>
                    <Input
                      id="mikrotik-profile"
                      value={mikrotikHotspotProfile}
                      onChange={(event) => setMikrotikHotspotProfile(event.target.value)}
                      placeholder="paid_wifi"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <Label htmlFor="mikrotik-ssl">Vérifier le certificat HTTPS</Label>
                      <p className="text-xs text-gray-500 mt-1">À activer uniquement avec un certificat valide.</p>
                    </div>
                    <Switch id="mikrotik-ssl" checked={mikrotikVerifySsl} onCheckedChange={setMikrotikVerifySsl} />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:justify-between pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetMikroTikToEnv}
                    disabled={mikrotikSaving || mikrotikTesting || mikrotikConfig?.source !== "database"}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Réutiliser le .env
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestMikroTik}
                      disabled={mikrotikSaving || mikrotikTesting}
                    >
                      {mikrotikTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
                      {mikrotikTesting ? "Test en cours…" : "Tester la connexion"}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveMikroTik}
                      disabled={mikrotikSaving || mikrotikTesting}
                      className="bg-cyan-700 hover:bg-cyan-800"
                    >
                      {mikrotikSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      {mikrotikSaving ? "Enregistrement…" : "Enregistrer MikroTik"}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Le mot de passe est chiffré côté serveur et n'est jamais renvoyé au navigateur. La configuration web est prioritaire sur le fichier <code>.env</code>.
                </p>
              </>
            )}
          </CardContent>
        </Card>

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
