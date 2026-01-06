"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function ReviewForm({ booking, userId }: { booking: any; userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  const isGuest = booking.guest_id === userId;
  const revieweeName = isGuest
    ? "the host"
    : booking.profiles?.full_name || "the guest";

  const createReview = useMutation({
    mutationFn: async () => {
      const revieweeId = isGuest
        ? booking.listings.host_id
        : booking.guest_id;

      const { error } = await supabase.from("reviews").insert({
        booking_id: booking.id,
        reviewer_id: userId,
        reviewee_id: revieweeId,
        rating,
        body: body.trim() || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      router.push("/my-bookings");
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Leave a Review</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            Review {revieweeName} for your booking at{" "}
            {booking.listings.title}
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rating">Rating</Label>
              <Select
                id="rating"
                value={rating.toString()}
                onChange={(e) => setRating(parseInt(e.target.value))}
              >
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Very Good</option>
                <option value="3">3 - Good</option>
                <option value="2">2 - Fair</option>
                <option value="1">1 - Poor</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="body">Review (optional)</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Share your experience..."
              />
            </div>
            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createReview.mutate()}
                disabled={createReview.isPending}
                className="flex-1"
              >
                {createReview.isPending ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
