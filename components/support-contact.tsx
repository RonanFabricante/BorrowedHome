export const SUPPORT_EMAIL = "hello@borrowedhome.app";

type SupportContactProps = {
  /** Shorter copy for tight spaces (auth cards). */
  compact?: boolean;
  className?: string;
};

/**
 * Public support contact — mailto only (works for users who cannot sign in).
 */
export function SupportContact({ compact = false, className }: SupportContactProps) {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "BorrowedHome support"
  )}`;

  return (
    <p
      className={
        className ??
        (compact
          ? "mt-4 text-center text-sm text-muted-foreground"
          : "text-sm text-muted-foreground")
      }
    >
      {compact ? "Trouble signing up or logging in? " : "Need help? "}
      <a
        href={mailto}
        className="text-primary hover:underline"
      >
        {SUPPORT_EMAIL}
      </a>
    </p>
  );
}
