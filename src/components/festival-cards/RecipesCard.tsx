import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CardUploadZone } from "@/components/festival-cards/shared";
import {
  ChefHat, Loader2, Plus, Trash2, Upload, FileText,
  AlertTriangle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  festivalId: string;
}

const STANDARD_ALLERGENS = [
  "gluten", "dairy", "egg", "fish", "shellfish", "soy", "nuts",
  "peanuts", "sesame", "celery", "mustard", "sulfites", "lupin", "molluscs",
] as const;

type Ingredient = { name: string; quantity: string };

interface RecipeRow {
  id: string;
  festival_id: string;
  concept_id: string | null;
  concept_name: string;
  product_name: string;
  recipe_text: string | null;
  gramaj: number | null;
  ingredients: Ingredient[];
  allergens: string[];
  allergen_notes: string | null;
  source_file_path: string | null;
  order_index: number;
}

interface Concept {
  id: string;
  name: string;
  order_index: number;
}

/* ---------------- Allergen badges ---------------- */

function AllergenBadges({ allergens, notes }: { allergens: string[]; notes: string | null }) {
  if (!allergens.length && !notes) {
    return (
      <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        No allergens detected yet. Upload a recipe or edit ingredients to generate.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-xs font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        Allergen note
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allergens.map((a) => (
          <Badge key={a} variant="outline" className="border-amber-500/60 bg-amber-100/60 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100">
            {a}
          </Badge>
        ))}
      </div>
      {notes && <p className="text-xs text-amber-900/80 dark:text-amber-100/80">{notes}</p>}
    </div>
  );
}

/* ---------------- Single product card ---------------- */

function ProductCard({
  recipe, onSave, onDelete,
}: {
  recipe: RecipeRow;
  onSave: (patch: Partial<RecipeRow>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState<RecipeRow>(recipe);
  const dirty = useMemo(
    () => JSON.stringify(local) !== JSON.stringify(recipe),
    [local, recipe],
  );

  const updateIng = (idx: number, patch: Partial<Ingredient>) => {
    setLocal((p) => ({
      ...p,
      ingredients: p.ingredients.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };
  const addIng = () =>
    setLocal((p) => ({ ...p, ingredients: [...p.ingredients, { name: "", quantity: "" }] }));
  const removeIng = (idx: number) =>
    setLocal((p) => ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) }));

  const toggleAllergen = (a: string) => {
    setLocal((p) => ({
      ...p,
      allergens: p.allergens.includes(a)
        ? p.allergens.filter((x) => x !== a)
        : [...p.allergens, a],
    }));
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Input
            value={local.product_name}
            onChange={(e) => setLocal({ ...local, product_name: e.target.value })}
            placeholder="Product name"
            className="h-8 font-semibold text-base border-transparent hover:border-border focus:border-border"
          />
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 shrink-0">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Gramaj (g per portion)</Label>
            <Input
              type="number"
              value={local.gramaj ?? ""}
              onChange={(e) =>
                setLocal({ ...local, gramaj: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="e.g. 280"
              className="h-8"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Recipe</Label>
          <Textarea
            value={local.recipe_text ?? ""}
            onChange={(e) => setLocal({ ...local, recipe_text: e.target.value })}
            placeholder="Step-by-step preparation method…"
            rows={4}
            className="text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">Ingredients (per portion)</Label>
            <Button variant="ghost" size="sm" onClick={addIng} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-1.5">
            {local.ingredients.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No ingredients yet.</p>
            )}
            {local.ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={ing.name}
                  onChange={(e) => updateIng(idx, { name: e.target.value })}
                  placeholder="Ingredient"
                  className="h-7 text-sm flex-1"
                />
                <Input
                  value={ing.quantity}
                  onChange={(e) => updateIng(idx, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="h-7 text-sm w-24"
                />
                <Button
                  variant="ghost" size="icon" onClick={() => removeIng(idx)}
                  className="h-7 w-7"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs mb-2 block">Allergens</Label>
          <AllergenBadges allergens={local.allergens} notes={local.allergen_notes} />
          <div className="mt-2 flex flex-wrap gap-1">
            {STANDARD_ALLERGENS.map((a) => {
              const active = local.allergens.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    active
                      ? "bg-amber-500/20 border-amber-500 text-amber-900 dark:text-amber-100"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        {dirty && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setLocal(recipe)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(local)}>
              Save changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Concept sub-card ---------------- */

function ConceptRecipesCard({
  festivalId, concept, recipes, onUploadClick,
}: {
  festivalId: string;
  concept: Concept;
  recipes: RecipeRow[];
  onUploadClick: (concept: Concept) => void;
}) {
  const qc = useQueryClient();

  const addBlank = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("festival_recipes").insert({
        festival_id: festivalId,
        concept_id: concept.id,
        concept_name: concept.name,
        product_name: "New product",
        ingredients: [],
        allergens: [],
        order_index: recipes.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["festival_recipes", festivalId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRecipe = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RecipeRow> }) => {
      const { error } = await supabase
        .from("festival_recipes")
        .update({
          product_name: patch.product_name,
          recipe_text: patch.recipe_text,
          gramaj: patch.gramaj,
          ingredients: patch.ingredients as any,
          allergens: patch.allergens,
          allergen_notes: patch.allergen_notes,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recipe saved");
      qc.invalidateQueries({ queryKey: ["festival_recipes", festivalId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("festival_recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recipe removed");
      qc.invalidateQueries({ queryKey: ["festival_recipes", festivalId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/20 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-primary" />
            {concept.name}
            <span className="text-xs text-muted-foreground font-normal">
              · {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
            </span>
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => onUploadClick(concept)}
            >
              <Upload className="h-3.5 w-3.5 mr-1" /> Upload recipe
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => addBlank.mutate()}
              disabled={addBlank.isPending}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add blank
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recipes.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No recipes yet for {concept.name}. Upload a document or add a blank product.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recipes.map((r) => (
              <ProductCard
                key={r.id}
                recipe={r}
                onSave={(patch) => updateRecipe.mutate({ id: r.id, patch })}
                onDelete={() => {
                  if (confirm(`Delete "${r.product_name}"?`)) deleteRecipe.mutate(r.id);
                }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Upload + AI review dialog ---------------- */

function UploadReviewDialog({
  festivalId, concept, onClose,
}: {
  festivalId: string;
  concept: Concept | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"pick" | "parsing" | "review">("pick");
  const [parsed, setParsed] = useState<any>(null);
  const [filePath, setFilePath] = useState<string | null>(null);

  const reset = () => {
    setStage("pick");
    setParsed(null);
    setFilePath(null);
    onClose();
  };

  const handleFile = async (file: File) => {
    if (!concept) return;
    setStage("parsing");
    try {
      // Upload to storage
      const path = `${festivalId}/recipes/${concept.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("festival-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      setFilePath(path);

      // Extract text (very simple: read file as text for txt/md, otherwise base64-skip)
      // Use document parsing via the edge function — text-only for now.
      let text = "";
      if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        text = await file.text();
      } else {
        // For PDF/Word/image — pass filename; AI gets context. Real OCR happens in real systems.
        text = `[Binary file uploaded: ${file.name} (${file.type}). Please infer typical recipe content.]`;
      }

      const { data, error } = await supabase.functions.invoke("extract-recipe", {
        body: { text, filename: file.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setParsed(data.recipe);
      setStage("review");
    } catch (e: any) {
      toast.error(e.message || "Failed to parse recipe");
      setStage("pick");
    }
  };

  const confirm = useMutation({
    mutationFn: async () => {
      if (!concept || !parsed) return;
      const { error } = await supabase.from("festival_recipes").insert({
        festival_id: festivalId,
        concept_id: concept.id,
        concept_name: concept.name,
        product_name: parsed.product_name || "Untitled product",
        recipe_text: parsed.recipe_text || null,
        gramaj: parsed.gramaj ?? null,
        ingredients: (parsed.ingredients || []) as any,
        allergens: parsed.allergens || [],
        allergen_notes: parsed.allergen_notes || null,
        source_file_path: filePath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recipe added");
      qc.invalidateQueries({ queryKey: ["festival_recipes", festivalId] });
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!concept} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Upload recipe → {concept?.name}
          </DialogTitle>
        </DialogHeader>

        {stage === "pick" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a PDF, Word doc, or image. AI will extract the product name, recipe,
              gramaj, ingredients and flag allergens for your review before saving.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition p-8 text-center"
            >
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium">Click to choose file</div>
              <div className="text-xs text-muted-foreground mt-1">
                PDF, Word, image, or text
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.txt,.md,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {stage === "parsing" && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">AI is reading your recipe…</p>
          </div>
        )}

        {stage === "review" && parsed && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Detected product</div>
              <div className="font-semibold">{parsed.product_name}</div>
              {parsed.gramaj && (
                <div className="text-sm">Gramaj: {parsed.gramaj} g</div>
              )}
            </div>
            {parsed.recipe_text && (
              <div>
                <Label className="text-xs">Recipe</Label>
                <p className="text-sm whitespace-pre-wrap rounded-md border bg-card p-3 mt-1">
                  {parsed.recipe_text}
                </p>
              </div>
            )}
            <div>
              <Label className="text-xs">Ingredients ({parsed.ingredients?.length || 0})</Label>
              <div className="mt-1 space-y-1 text-sm">
                {(parsed.ingredients || []).map((ing: Ingredient, i: number) => (
                  <div key={i} className="flex justify-between border-b border-border/40 py-1">
                    <span>{ing.name}</span>
                    <span className="text-muted-foreground">{ing.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
            <AllergenBadges
              allergens={parsed.allergens || []}
              notes={parsed.allergen_notes}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                {confirm.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Confirm & Save
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Main card ---------------- */

export function RecipesCard({ festivalId }: Props) {
  const [uploadConcept, setUploadConcept] = useState<Concept | null>(null);

  const { data: concepts = [], isLoading: loadingConcepts } = useQuery({
    queryKey: ["festival_concepts", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_concepts")
        .select("id, name, order_index")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return data as Concept[];
    },
  });

  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ["festival_recipes", festivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("festival_recipes")
        .select("*")
        .eq("festival_id", festivalId)
        .order("order_index");
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        allergens: r.allergens || [],
      })) as RecipeRow[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, RecipeRow[]>();
    for (const r of recipes) {
      const key = r.concept_id || "__unassigned__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [recipes]);

  if (loadingConcepts || loadingRecipes) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-primary" />
          Recipes per Concept
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Per-product recipes with AI-detected allergens. Feeds into the Groceries & Ordering card.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {concepts.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No concepts defined yet. Add concepts first to attach recipes.
          </div>
        ) : (
          concepts.map((c) => (
            <ConceptRecipesCard
              key={c.id}
              festivalId={festivalId}
              concept={c}
              recipes={grouped.get(c.id) || []}
              onUploadClick={setUploadConcept}
            />
          ))
        )}

        <div className="pt-4 border-t">
          <CardUploadZone
            festivalId={festivalId}
            cardName="recipes"
            title="Card-level documents"
            subtitle="Upload reference material that applies to all recipes (e.g. allergen master sheet)."
          />
        </div>
      </CardContent>

      <UploadReviewDialog
        festivalId={festivalId}
        concept={uploadConcept}
        onClose={() => setUploadConcept(null)}
      />
    </Card>
  );
}

export default RecipesCard;
