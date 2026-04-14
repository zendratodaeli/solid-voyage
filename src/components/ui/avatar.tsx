"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ─── Avatar Root ─────────────────────────────────── */

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

/* ─── Avatar Image ────────────────────────────────── */

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, alt, ...props }, ref) => {
  const [hasError, setHasError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
    setLoaded(false);
  }, [src]);

  if (hasError || !src) return null;

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={cn(
        "aspect-square h-full w-full object-cover",
        !loaded && "sr-only",
        className
      )}
      onLoad={() => setLoaded(true)}
      onError={() => setHasError(true)}
      {...props}
    />
  );
});
AvatarImage.displayName = "AvatarImage";

/* ─── Avatar Fallback ─────────────────────────────── */

const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
