"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { hostDeclarationText } from "@/lib/legal/terms-au";

interface HostDeclarationModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function HostDeclarationModal({
  open,
  onConfirm,
  onCancel,
}: HostDeclarationModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard navigation
  useEffect(() => {
    if (open && confirmButtonRef.current) {
      // Focus the confirm button when modal opens
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Host Declaration</DialogTitle>
          <DialogDescription>
            Please read and confirm the following declaration before continuing.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="p-4 bg-muted rounded-lg whitespace-pre-line text-sm leading-relaxed">
            {hostDeclarationText}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 mt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            autoFocus
          >
            I Agree and Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
