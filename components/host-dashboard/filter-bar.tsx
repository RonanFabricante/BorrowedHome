"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { surfaceClasses } from "@/lib/ui/tokens";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  statusOptions: Array<{ value: string; label: string }>;
  showClear?: boolean;
  onClear?: () => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  statusOptions,
  showClear = false,
  onClear,
}: FilterBarProps) {
  const hasActiveFilters = searchQuery || statusFilter !== "ALL";

  return (
    <div className={`${surfaceClasses.mutedSurface} p-4 space-y-4`}>
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by listing or guest name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant={statusFilter === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => onStatusChange(option.value)}
              className="h-10"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {showClear && hasActiveFilters && onClear && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-slate-600 hover:text-slate-900 h-8"
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
