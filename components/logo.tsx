import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "reversed";
  href?: string | null;
  showText?: boolean;
}

const sizeMap = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

export function Logo({
  className,
  size = "md",
  variant = "default",
  href = "/",
  showText = false,
}: LogoProps) {
  // Brand colors from design tokens
  const primaryColor =
    variant === "reversed" ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))";
  
  const logoContent = (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 120 100"
        className={cn(sizeMap[size], "flex-shrink-0")}
        aria-label="BorrowedHome logo"
        role="img"
      >
        {/* House outline with integrated BH letters */}
        {/* Left wall (also left stroke of B) */}
        <line
          x1="20"
          y1="20"
          x2="20"
          y2="80"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* B letter - top curve */}
        <path
          d="M 20 20 Q 35 20 35 35 Q 35 50 20 50"
          fill="none"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* B letter - bottom curve */}
        <path
          d="M 20 50 Q 35 50 35 65 Q 35 80 20 80"
          fill="none"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* H letter - left vertical stroke */}
        <line
          x1="50"
          y1="20"
          x2="50"
          y2="80"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* H letter - horizontal bar */}
        <line
          x1="50"
          y1="50"
          x2="70"
          y2="50"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* H letter - right vertical stroke (also right wall) */}
        <line
          x1="70"
          y1="20"
          x2="70"
          y2="80"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* House base (horizontal line connecting B and H) */}
        <line
          x1="20"
          y1="80"
          x2="70"
          y2="80"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* House roof - left slanted line */}
        <line
          x1="20"
          y1="20"
          x2="45"
          y2="5"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* House roof - right slanted line */}
        <line
          x1="70"
          y1="20"
          x2="45"
          y2="5"
          stroke={primaryColor}
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
      {showText && (
        <span
          className={cn(
            "font-display font-medium tracking-tight",
            size === "sm" && "text-sm",
            size === "md" && "text-base",
            size === "lg" && "text-xl",
            size === "xl" && "text-2xl",
            variant === "reversed" ? "text-primary-foreground" : "text-primary"
          )}
        >
          BorrowedHome
        </span>
      )}
    </div>
  );

  if (href === null) {
    return logoContent;
  }

  return (
    <Link href={href} className="inline-block focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm">
      {logoContent}
    </Link>
  );
}
