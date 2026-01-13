"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NormalizedPlace {
  id: string;
  label: string;
  placeType: string;
  country: string | null;
  region: string | null;
  city: string | null;
  suburb: string | null;
  postcode: string | null;
  lng: number;
  lat: number;
}

interface PlaceAutocompleteProps {
  value: string;
  onChangeValue: (value: string) => void;
  onSelectPlace: (place: NormalizedPlace | null) => void;
  placeholder?: string;
  country?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

export function PlaceAutocomplete({
  value,
  onChangeValue,
  onSelectPlace,
  placeholder = "Suburb or City",
  country,
  types,
  className,
  id,
  "data-testid": testId,
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<NormalizedPlace[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: "6",
      });

      if (country) {
        params.set("country", country);
      }

      if (types) {
        params.set("types", types);
      }

      const response = await fetch(`/api/places/autocomplete?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 429) {
          setError("Too many requests. Please try again later.");
        } else {
          setError("Couldn't fetch suggestions, try again");
        }
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      const data = await response.json();
      const results = data.results || [];

      setSuggestions(results);
      setIsOpen(results.length > 0);
      setSelectedIndex(-1);
    } catch (err) {
      console.error("[PlaceAutocomplete] Search error:", err);
      setError("Couldn't fetch suggestions, try again");
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, [country, types]);

  // Handle input change with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (query.length >= 3) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(query);
      }, 250);
    } else {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, performSearch]);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    onChangeValue(newValue);
    onSelectPlace(null); // Clear selection when typing
  };

  const handleSelect = (place: NormalizedPlace) => {
    setQuery(place.label);
    onChangeValue(place.label);
    onSelectPlace(place);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev < suggestions.length - 1 ? prev + 1 : prev;
          // Scroll into view
          if (listboxRef.current && next >= 0) {
            const item = listboxRef.current.children[next] as HTMLElement;
            item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          return next;
        });
        break;

      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : -1;
          // Scroll into view
          if (listboxRef.current && next >= 0) {
            const item = listboxRef.current.children[next] as HTMLElement;
            item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          return next;
        });
        break;

      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;

      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;

      default:
        break;
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay to allow click events on suggestions
    setTimeout(() => {
      setIsOpen(false);
      setSelectedIndex(-1);
    }, 200);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          data-testid={testId}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${id}-listbox` : undefined}
          aria-activedescendant={
            selectedIndex >= 0 ? `${id}-option-${selectedIndex}` : undefined
          }
          role="combobox"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listboxRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((place, index) => (
            <li
              key={place.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={selectedIndex === index}
              className={cn(
                "px-3 py-2 cursor-pointer text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:bg-accent focus:text-accent-foreground outline-none",
                selectedIndex === index && "bg-accent text-accent-foreground"
              )}
              onClick={() => handleSelect(place)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="font-medium">{place.label}</div>
              {(place.region || place.country) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[place.region, place.country].filter(Boolean).join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}

      {isOpen && !isLoading && suggestions.length === 0 && query.length >= 3 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
          No matches found
        </div>
      )}
    </div>
  );
}
