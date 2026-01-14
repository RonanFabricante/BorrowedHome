// Stripe Cancellation Operations
// Handles PaymentIntent cancellation (void) and refunds for booking cancellations

import { stripe } from "@/lib/stripe/server";
import Stripe from "stripe";

export interface CancellationPaymentResult {
  success: boolean;
  action: "voided" | "refunded" | "none" | "failed";
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  amountCents?: number;
  error?: string;
}

/**
 * Cancel or refund a PaymentIntent based on its current state
 * 
 * For authorized (not captured) payments: VOID (cancel PaymentIntent)
 * For captured payments: REFUND (create Stripe Refund)
 */
export async function processCancellationPayment(
  stripePaymentIntentId: string,
  refundableAmountCents: number
): Promise<CancellationPaymentResult> {
  try {
    // Retrieve PaymentIntent to check current state
    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

    // If already canceled, return success (idempotent)
    if (paymentIntent.status === "canceled") {
      return {
        success: true,
        action: "voided",
        stripePaymentIntentId,
        amountCents: refundableAmountCents,
      };
    }

    // If payment was never completed (requires_payment_method), nothing to void/refund
    if (paymentIntent.status === "requires_payment_method") {
      return {
        success: true,
        action: "none",
        stripePaymentIntentId,
        amountCents: 0, // No amount to refund since payment was never authorized
      };
    }

    // If payment is only authorized (not captured), void it
    if (paymentIntent.status === "requires_capture") {
      try {
        const canceled = await stripe.paymentIntents.cancel(stripePaymentIntentId);
        
        return {
          success: true,
          action: "voided",
          stripePaymentIntentId,
          amountCents: refundableAmountCents,
        };
      } catch (error: any) {
        // If already canceled (race condition), return success
        if (error.code === "payment_intent_unexpected_state") {
          return {
            success: true,
            action: "voided",
            stripePaymentIntentId,
            amountCents: refundableAmountCents,
          };
        }
        throw error;
      }
    }

    // If payment is captured (succeeded), create a refund
    if (paymentIntent.status === "succeeded") {
      // Check if already refunded (idempotency)
      const existingRefunds = await stripe.refunds.list({
        payment_intent: stripePaymentIntentId,
        limit: 10,
      });

      // If full refund already exists, return success
      const fullRefund = existingRefunds.data.find(
        (r) => r.amount === paymentIntent.amount && r.status === "succeeded"
      );
      if (fullRefund) {
        return {
          success: true,
          action: "refunded",
          stripePaymentIntentId,
          stripeRefundId: fullRefund.id,
          amountCents: refundableAmountCents,
        };
      }

      // Check for partial refunds
      const totalRefunded = existingRefunds.data
        .filter((r) => r.status === "succeeded")
        .reduce((sum, r) => sum + r.amount, 0);

      const remainingRefundable = refundableAmountCents - totalRefunded;

      if (remainingRefundable <= 0) {
        // Already fully refunded
        return {
          success: true,
          action: "refunded",
          stripePaymentIntentId,
          amountCents: refundableAmountCents,
        };
      }

      // Create refund (full or partial)
      const refund = await stripe.refunds.create({
        payment_intent: stripePaymentIntentId,
        amount: remainingRefundable,
        reason: "requested_by_customer",
        metadata: {
          type: "booking_cancellation",
          refund_type: remainingRefundable === paymentIntent.amount ? "full" : "partial",
        },
      });

      return {
        success: true,
        action: "refunded",
        stripePaymentIntentId,
        stripeRefundId: refund.id,
        amountCents: remainingRefundable,
      };
    }

    // PaymentIntent is in an unexpected state
    return {
      success: false,
      action: "failed",
      stripePaymentIntentId,
      error: `PaymentIntent is in unexpected state: ${paymentIntent.status}`,
    };
  } catch (error: any) {
    console.error("[Cancellation] Stripe operation error:", error);
    return {
      success: false,
      action: "failed",
      error: error.message || "Failed to process cancellation payment",
    };
  }
}

/**
 * Check PaymentIntent status and return current payment state
 */
export async function getPaymentIntentState(
  stripePaymentIntentId: string
): Promise<{
  status: string;
  amount: number;
  captured: boolean;
  canceled: boolean;
}> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    
    return {
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      captured: paymentIntent.status === "succeeded",
      canceled: paymentIntent.status === "canceled",
    };
  } catch (error: any) {
    throw new Error(`Failed to retrieve PaymentIntent: ${error.message}`);
  }
}
