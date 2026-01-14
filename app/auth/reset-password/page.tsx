"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Logo } from "@/components/logo";

const resetSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormData) => {
    setError(null);
    setLoading(true);
    try {
      // Get the site URL - default to production URL if not set
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://borrowedhome.app";
      const redirectTo = `${siteUrl}/auth/update-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        data.email,
        {
          redirectTo,
        }
      );

      if (resetError) throw resetError;

      // Always show success message (security: don't reveal if email exists)
      setSuccess(true);
    } catch (err: any) {
      // Generic error message (security: don't reveal details)
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <Logo size="lg" href={null} />
            </div>
            <CardTitle className="text-center">Reset password</CardTitle>
            <CardDescription>
              Check your email for the reset link
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 text-sm text-center bg-muted rounded-md">
              If an account exists for that email, we&apos;ve sent a password reset link.
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/auth/login")}
            >
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <Logo size="lg" href={null} />
          </div>
          <CardTitle className="text-center">Reset password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a secure reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            className="w-full mt-4"
            onClick={() => router.push("/auth/login")}
          >
            Back to login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
