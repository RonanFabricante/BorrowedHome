"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

interface ReviewSnippet {
  id: string;
  rating: number;
  comment: string | null;
  space_label: string;
  created_at: string;
  listing_id: string;
  listing_title: string;
}

interface HostReviewSummaryProps {
  hostId: string;
  hostName: string | null;
  summary?: {
    average_rating: number | null;
    review_count: number;
  } | null;
  snippets?: ReviewSnippet[];
}

export function HostReviewSummary({
  hostId,
  hostName,
  summary,
  snippets = [],
}: HostReviewSummaryProps) {
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
      </div>
    );
  };

  if (!summary || summary.review_count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reviews about this host</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-muted-foreground">
              New host · No reviews yet
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews about this host</CardTitle>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1">
            <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold text-lg">
              {summary.average_rating?.toFixed(1)} Host rating
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          From {summary.review_count} verified day-use booking{summary.review_count !== 1 ? "s" : ""}
        </p>
      </CardHeader>
      <CardContent>
        {snippets.length > 0 && (
          <div className="space-y-4">
            {snippets.map((snippet) => (
              <div key={snippet.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                <div className="flex items-start justify-between mb-2">
                  {renderStars(snippet.rating)}
                </div>
                
                {snippet.comment && (
                  <p className="text-sm text-foreground mb-2 line-clamp-2">
                    {snippet.comment}
                  </p>
                )}
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>from</span>
                  <Link
                    href={`/listings/${snippet.listing_id}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {snippet.listing_title}
                  </Link>
                  <span>·</span>
                  <span>{snippet.space_label}</span>
                  <span>·</span>
                  <span>{format(new Date(snippet.created_at), "MMM yyyy")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
