"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface CancelBookingModalProps {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  totalAmount: number;
  refundAmount: number;
  refundMessage: string;
  onSuccess?: () => void;
}

export function CancelBookingModal({
  open,
  onClose,
  bookingId,
  totalAmount,
  refundAmount,
  refundMessage,
  onSuccess,
}: CancelBookingModalProps) {
  const router = useRouter();
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason) {
      setError("Please select a cancellation reason");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
          note: note.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel booking");
      }

      // Success
      if (onSuccess) {
        onSuccess();
      }
      router.refresh();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to cancel booking. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Booking</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this booking?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Refund Information */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Refund Information</p>
            <p className="text-sm text-muted-foreground mb-1">
              {refundMessage}
            </p>
            <p className="text-sm font-semibold">
              Refund Amount: {formatCurrency(refundAmount)}
            </p>
          </div>

          {/* Cancellation Reason */}
          <div>
            <Label htmlFor="reason">Cancellation Reason *</Label>
            <Select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            >
              <option value="">Select a reason</option>
              <option value="changed_plans">Changed Plans</option>
              <option value="unavailable">No Longer Available</option>
              <option value="safety">Safety Concern</option>
              <option value="other">Other</option>
            </Select>
          </div>

          {/* Optional Note */}
          <div>
            <Label htmlFor="note">Additional Note (Optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Please provide any additional details..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {note.length}/500 characters
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Keep Booking
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || !reason}
              className="flex-1"
            >
              {isSubmitting ? "Cancelling..." : "Cancel Booking"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
