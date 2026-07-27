import { useMemo, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { FOODS, Food, scale } from './foodDatabase';

interface Props {
  meal: string;
  onClose: () => void;
  onAdd: (foodId: string, grams: number) => void;
}

export function AddFoodModal({ meal, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState<number>(100);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FOODS.slice(0, 8);
    return FOODS.filter(f =>
      f.name.toLowerCase().includes(q) || f.brand?.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query]);

  const preview = selected ? scale(selected.per100g, grams) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="text-xs text-muted-foreground">Add to</div>
            <h2 className="text-card-foreground">{meal}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-muted hover:bg-secondary flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {!selected ? (
          <>
            <div className="p-5 pb-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search foods…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-input-background border border-border rounded-2xl outline-none focus:ring-2 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
              {results.map(food => (
                <button
                  key={food.id}
                  onClick={() => { setSelected(food); setGrams(food.servingSize); }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-muted/60 hover:bg-secondary border border-transparent hover:border-border transition-all text-left"
                >
                  <div className="min-w-0 pr-3">
                    <div className="text-card-foreground truncate">{food.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {food.brand ? `${food.brand} • ` : ''}{food.servingLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-sm text-card-foreground">
                        {Math.round(scale(food.per100g, food.servingSize).calories)} kcal
                      </div>
                      <div className="text-[10px] text-muted-foreground">per serving</div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              ))}
              {results.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-10">
                  No foods found. Try a different search.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div>
              <h3 className="text-card-foreground">{selected.name}</h3>
              {selected.brand && (
                <p className="text-sm text-muted-foreground">{selected.brand}</p>
              )}
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Serving (grams)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={grams}
                  onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))}
                  className="flex-1 px-4 py-3 bg-input-background border border-border rounded-2xl outline-none focus:ring-2 focus:ring-ring/40 text-foreground"
                />
                <button
                  onClick={() => setGrams(selected.servingSize)}
                  className="px-4 py-3 rounded-2xl bg-secondary text-secondary-foreground text-sm whitespace-nowrap"
                >
                  {selected.servingLabel}
                </button>
              </div>
            </div>

            {preview && (
              <div className="bg-muted/60 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-card-foreground">
                  <span>Calories</span>
                  <span>{Math.round(preview.calories)} kcal</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                  <Stat label="Protein" value={`${preview.protein.toFixed(1)}g`} color="var(--chart-1)" />
                  <Stat label="Carbs" value={`${preview.carbs.toFixed(1)}g`} color="var(--chart-2)" />
                  <Stat label="Fat" value={`${preview.fat.toFixed(1)}g`} color="var(--chart-3)" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-3 rounded-2xl bg-secondary text-secondary-foreground"
              >
                Back
              </button>
              <button
                onClick={() => { onAdd(selected.id, grams); onClose(); }}
                className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              >
                Add to {meal}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm" style={{ color }}>{value}</div>
    </div>
  );
}
