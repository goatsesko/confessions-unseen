import { useEffect, useState } from "react";
import { resolveAvatar } from "@/lib/messages";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

export function UserAvatar({
  username,
  avatarPath,
  size = "sm",
  className,
}: {
  username: string;
  avatarPath?: string | null | undefined;
  size?: keyof typeof SIZES | undefined;
  className?: string | undefined;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    resolveAvatar(avatarPath).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated font-bold uppercase text-primary",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={`@${username}`} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        username.slice(0, 2)
      )}
    </div>
  );
}
