"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

export function ReviewForm({ 
  booking, 
  userId, 
  spaceLabel 
}: { 
  booking: any; 
  userId: string;
  spaceLabel: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ratingHelperText = {
    1: "Not as expected",
    2: "Below expectations",
    3: "Okay",
    4: "Very good",
    5: "Excellent",
  };

  const createReview = useMutation({
    mutationFn: async () => {
      setError(null);

      if (rating === 0) {
        throw new Error("Please select a rating");
      }

      if (comment.length > 1200) {
        throw new Error("Review comment must be 1200 characters or less");
      }

      // Call RPC function to create review
      const { data, error: rpcError } = await supabase.rpc("create_listing_review", {
        p_booking_id: booking.id,
        p_rating: rating,
        p_space_label: spaceLabel,
        p_comment: comment.trim() || null,
      });

      if (rpcError) {
        console.error("[ReviewForm] Error creating review:", rpcError);
        
        // Handle specific error cases
        if (rpcError.code === "23505") {
          throw new Error("You have already submitted a review for this booking.");
        } else if (rpcError.code === "42501") {
          throw new Error("You don't have permission to review this booking. Make sure the booking is completed.");
        } else if (rpcError.message) {
          throw new Error(rpcError.message);
        }
        
        throw rpcError;
      }

      return data;
    },
    onSuccess: () => {
      // Redirect to listing page, anchored to reviews section
      router.push(`/listings/${booking.listings.id}#reviews`);
      router.refresh();
    },
    onError: (error: any) => {
      console.error("[ReviewForm] Review submission failed:", error);
      setError(
        error.message || 
        "Failed to submit review. Please try again."
      );
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Review your BorrowedHome</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            This helps future guests choose with confidence. Day-use only.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {/* Star Rating */}
            <div>
              <Label className="text-base font-semibold mb-3 block">
                Rating <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="focus:outline-none transition-transform hover:scale-110"
                    aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                  >
                    <Star
                      className={`w-10 h-10 ${
                        star <= (hoveredRating || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      } transition-colors`}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  {ratingHelperText[rating as keyof typeof ratingHelperText]}
                </p>
              )}
            </div>

            {/* What did you book? */}
            <div>
              <Label className="text-base font-semibold mb-2 block">
                What did you book?
              </Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm py-1.5 px-3">
                  {spaceLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">Day-use booking</span>
              </div>
            </div>

            {/* Comment */}
            <div>
              <Label htmlFor="comment" className="text-base font-semibold mb-2 block">
                Share details that would help the next guest
                <span className="text-muted-foreground font-normal text-sm ml-1">(optional)</span>
              </Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={6}
                maxLength={1200}
                placeholder="Was the space clean and as described?&#10;How was access and communication?&#10;Anything to know about noise, parking, or setup?"
                className="resize-none"
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-muted-foreground">
                  Avoid sharing personal info (phone numbers, addresses, etc.).
                </p>
                <p className="text-xs text-muted-foreground">
                  {comment.length}/1200
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
                disabled={createReview.isPending}
              >
                Not now
              </Button>
              <Button
                onClick={() => createReview.mutate()}
                disabled={createReview.isPending || rating === 0}
                className="flex-1"
              >
                {createReview.isPending ? "Submitting..." : "Submit review"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
