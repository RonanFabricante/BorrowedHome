"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  space_label: string;
  created_at: string;
  guest_initial: string;
}

interface ListingReviewsProps {
  listingId: string;
  initialSummary?: {
    average_rating: number | null;
    review_count: number;
  };
  initialReviews?: Review[];
}

export function ListingReviews({ 
  listingId, 
  initialSummary,
  initialReviews = []
}: ListingReviewsProps) {
  const supabase = createClient();
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const displayReviews = showAll ? reviews : reviews.slice(0, 3);

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        ))}
        <span className="ml-1 text-sm font-medium">{rating}</span>
      </div>
    );
  };

  const truncateComment = (comment: string, maxLength: number = 280) => {
    if (comment.length <= maxLength) return comment;
    return comment.slice(0, maxLength) + "...";
  };

  if (!summary || summary.review_count === 0) {
    return (
      <Card id="reviews" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <p className="text-sm text-muted-foreground">
            Completed day-use bookings
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-2">
              No reviews yet. Be the first to book this space.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="reviews" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Reviews</CardTitle>
        <p className="text-sm text-muted-foreground">
          From completed day-use bookings
        </p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1">
            <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold text-lg">
              {summary.average_rating?.toFixed(1)}
            </span>
          </div>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {summary.review_count} review{summary.review_count !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {displayReviews.map((review) => (
            <div key={review.id} className="border-b last:border-b-0 pb-6 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  {renderStars(review.rating)}
                </div>
                <Badge variant="outline" className="text-xs">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Completed booking
                </Badge>
              </div>
              
              {review.comment && (
                <p className="text-sm text-foreground mb-3 whitespace-pre-wrap">
                  {showAll || review.comment.length <= 280
                    ? review.comment
                    : truncateComment(review.comment)}
                  {!showAll && review.comment.length > 280 && (
                    <button
                      onClick={() => setShowAll(true)}
                      className="text-primary hover:underline ml-1"
                    >
                      Read more
                    </button>
                  )}
                </p>
              )}
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Guest {review.guest_initial}</span>
                <span>·</span>
                <span>{review.space_label}</span>
                <span>·</span>
                <span>{format(new Date(review.created_at), "MMM yyyy")}</span>
              </div>
            </div>
          ))}
          
          {reviews.length > 3 && !showAll && (
            <div className="pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAll(true)}
                className="w-full"
              >
                View all {reviews.length} reviews
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
