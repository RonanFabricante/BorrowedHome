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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { onboardingSummaryGuest, TERMS_VERSION } from "@/lib/legal/terms-au";
import { Logo } from "@/components/logo";
import { differenceInYears, parse } from "date-fns";

// Helper function to calculate age from date of birth
const calculateAge = (dateOfBirth: string): number => {
  const birthDate = parse(dateOfBirth, "yyyy-MM-dd", new Date());
  return differenceInYears(new Date(), birthDate);
};

const signupSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  dateOfBirth: z.string().min(1, "Date of birth is required").refine(
    (date) => {
      const age = calculateAge(date);
      return age >= 18;
    },
    {
      message: "You must be at least 18 years old to use BorrowedHome",
    }
  ),
  acceptedGuestTerms: z.boolean().refine((val) => val === true, {
    message: "You must read and agree to the BorrowedHome Guest Terms",
  }),
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      acceptedGuestTerms: false,
    },
  });

  const onSubmit = async (data: SignupFormData) => {
    setError(null);
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            date_of_birth: data.dateOfBirth,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("User creation failed");
      }

      // Profile is automatically created by database trigger (handle_new_user)
      // Wait a moment for the trigger to complete and session to be established
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Record guest terms acceptance
      // Retry logic in case session isn't fully established yet
      let acceptanceRecorded = false;
      let attempts = 0;
      while (!acceptanceRecorded && attempts < 3) {
        const { error: acceptanceError } = await supabase
          .from("user_legal_acceptances")
          .insert({
            user_id: authData.user.id,
            doc_type: "guest_terms",
            doc_version: TERMS_VERSION,
            accepted_at: new Date().toISOString(),
            metadata: {
              signup: true,
            },
          });

        if (!acceptanceError) {
          acceptanceRecorded = true;
        } else {
          // If RLS error, wait and retry
          if (acceptanceError.message.includes("row-level security")) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            // Other error, log but don't block signup
            console.error("Failed to record terms acceptance:", acceptanceError);
            break;
          }
        }
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <Logo size="lg" href={null} />
          </div>
          <CardTitle className="text-center">Sign Up</CardTitle>
          <CardDescription>
            Create your BorrowedHome account
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
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                {...register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>
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
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
                {...register("dateOfBirth")}
              />
              {errors.dateOfBirth && (
                <p className="text-sm text-destructive mt-1">
                  {errors.dateOfBirth.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                You must be 18 years or older to use BorrowedHome
              </p>
            </div>

            {/* Plain-English Summary */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-sm">{onboardingSummaryGuest.title}</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {onboardingSummaryGuest.bullets.map((bullet, idx) => (
                  <li key={idx}>{bullet}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground italic">
                {onboardingSummaryGuest.footer}
              </p>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="acceptedGuestTerms"
                checked={watch("acceptedGuestTerms")}
                onChange={(e) =>
                  setValue("acceptedGuestTerms", e.target.checked)
                }
              />
              <Label htmlFor="acceptedGuestTerms" className="cursor-pointer text-sm leading-tight">
                I have read and agree to the{" "}
                <Link
                  href="/terms/guest-au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  BorrowedHome Guest Terms
                </Link>
              </Label>
            </div>
            {errors.acceptedGuestTerms && (
              <p className="text-sm text-destructive">
                {errors.acceptedGuestTerms.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
