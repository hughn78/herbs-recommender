// MedicineAutocomplete — type-ahead lookup for the review workflow.
//
// Built around the existing medication intelligence tables. Returns
// short suggestion rows (generic, brand, drug class) and dispatches a
// resolved concept to the parent. The parent is responsible for the
// actual deduplication / confirmation — the component is a thin UI.
//
// Keyboard:
//   - ArrowDown / ArrowUp move the highlight
//   - Enter accepts the highlighted suggestion
//   - Escape closes the menu without selecting
//   - Typing refines the query
//
// Free-text: when the user presses Enter with no suggestion highlighted,
// the input value is submitted as a free-text unknown medication so the
// pharmacist can still record medicines that aren't in the index.

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Pill, Loader2, Plus, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  medicationAutocompleteFn,
  type AutocompleteSuggestion,
} from "@/lib/medication-autocomplete.functions";

export type ResolvedMedication = {
  generic_name: string;
  brand_name?: string | null;
  drug_class?: string | null;
  source: "autocomplete" | "free_text";
  confidence?: number;
};

type Props = {
  /** Already-confirmed generic names to suppress from suggestions. */
  exclude?: string[];
  /** Add a confirmed medication to the case. */
  onAdd: (m: ResolvedMedication) => void;
  /** Disable while loading external state. */
  disabled?: boolean;
  /** Placeholder text. */
  placeholder?: string;
  /** Optional initial value (e.g. when editing). */
  defaultValue?: string;
};

export function MedicineAutocomplete({
  exclude = [],
  onAdd,
  disabled,
  placeholder = "Search a medicine (generic, brand, or free text)…",
  defaultValue = "",
}: Props) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [debounced, setDebounced] = useState(defaultValue.trim());
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const runAutocomplete = useServerFn(medicationAutocompleteFn);
  const { data: suggestions, isFetching } = useQuery<AutocompleteSuggestion[]>({
    queryKey: ["med-autocomplete", debounced],
    queryFn: () => runAutocomplete({ data: { query: debounced, limit: 6 } }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => {
    const lcExclude = new Set(exclude.map((e) => e.toLowerCase()));
    return (suggestions ?? []).filter((s) => !lcExclude.has(s.genericName.toLowerCase()));
  }, [suggestions, exclude]);

  useEffect(() => {
    setHighlight(0);
  }, [filtered.length, debounced]);

  function pick(s: AutocompleteSuggestion) {
    onAdd({
      generic_name: s.genericName,
      brand_name: s.brandName,
      drug_class: s.drugClasses[0] ?? null,
      source: "autocomplete",
      confidence: s.confidence,
    });
    setQuery("");
    setDebounced("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function pickFreeText() {
    const v = query.trim();
    if (!v) return;
    onAdd({ generic_name: v, brand_name: null, drug_class: null, source: "free_text" });
    setQuery("");
    setDebounced("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" && filtered.length > 0) {
        setOpen(true);
        e.preventDefault();
        return;
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length)); // +1 = free-text row
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0 && highlight < filtered.length) {
        pick(filtered[highlight]);
      } else {
        pickFreeText();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Pill className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Defer close so a click on a menu item still registers.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-9 text-sm font-mono"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && filtered.length > 0 ? `${listId}-opt-${highlight}` : undefined
          }
        />
        {isFetching && debounced.length >= 2 && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" aria-hidden="true" />
        )}
      </div>

      {open && (filtered.length > 0 || query.trim().length >= 2) && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-md border border-hairline bg-card shadow-md text-sm"
        >
          {filtered.map((s, i) => (
            <li
              key={s.conceptId}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "px-3 py-2 cursor-pointer border-b border-hairline last:border-b-0",
                i === highlight && "bg-secondary/50",
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{s.genericName}</span>
                {s.brandName && (
                  <span className="text-xs text-muted-foreground">Brand: {s.brandName}</span>
                )}
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.matchType}
                </span>
              </div>
              {s.drugClasses.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {s.drugClasses.slice(0, 3).join(" · ")}
                </p>
              )}
            </li>
          ))}
          {query.trim().length >= 2 && (
            <li
              id={`${listId}-opt-${filtered.length}`}
              role="option"
              aria-selected={highlight === filtered.length}
              onMouseDown={(e) => {
                e.preventDefault();
                pickFreeText();
              }}
              onMouseEnter={() => setHighlight(filtered.length)}
              className={cn(
                "px-3 py-2 cursor-pointer text-foreground",
                highlight === filtered.length && "bg-secondary/50",
              )}
            >
              <div className="flex items-center gap-2 text-xs">
                {filtered.length === 0 ? (
                  <>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>
                      Not recognised — add as free text:{" "}
                      <span className="font-mono">{query.trim()}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>
                      Add as free text: <span className="font-mono">{query.trim()}</span>
                    </span>
                  </>
                )}
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
