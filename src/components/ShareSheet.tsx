import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Download, Flag, Link2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { formatConfessionId } from "@/lib/confessions";

const BRAND_PINK = "#ff2d78";

/** Renders a branded 1080x1350 confession card for social sharing. */
export async function renderConfessionImage(number: number, body: string, category: string): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 900);
  glow.addColorStop(0, "rgba(255,45,120,0.30)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.fillStyle = BRAND_PINK;
  ctx.font = "800 44px Sora, system-ui, sans-serif";
  ctx.fillText(`CONFESSION ${formatConfessionId(number)}`, 96, 168);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 30px Manrope, system-ui, sans-serif";
  ctx.fillText(category.toUpperCase(), 96, 216);

  // body text, auto-sized so nothing is ever cut off
  const maxWidth = W - 192;
  const top = 300;
  const bottom = H - 220;
  let size = 62;
  let lines: string[] = [];
  for (; size >= 26; size -= 2) {
    ctx.font = `700 ${size}px Sora, system-ui, sans-serif`;
    lines = wrap(ctx, body, maxWidth);
    if (lines.length * size * 1.32 <= bottom - top) break;
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${size}px Sora, system-ui, sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, 96, top + (i + 1) * size * 1.32));

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "600 30px Manrope, system-ui, sans-serif";
  ctx.fillText("COMRADES", 96, H - 148);
  ctx.fillStyle = BRAND_PINK;
  ctx.font = "800 44px Sora, system-ui, sans-serif";
  ctx.fillText("CONFESSIONS", 96, H - 100);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export function ShareSheet({
  open,
  onClose,
  number,
  body,
  category,
  onReport,
}: {
  open: boolean;
  onClose: () => void;
  number: number;
  body: string;
  category: string;
  onReport?: (() => void) | undefined;
}) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const url = `${window.location.origin}/confession/${number}`;
  const text = `Confession ${formatConfessionId(number)} — Comrades Confessions`;

  const targets = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  ];

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        onClose();
        return;
      } catch {
        /* dismissed */
      }
    }
    await copy();
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
    onClose();
  }

  async function saveImage() {
    setBusy(true);
    try {
      const blob = await renderConfessionImage(number, body, category);
      if (!blob) throw new Error("render");
      const file = new File([blob], `confession-${number}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: text });
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `confession-${formatConfessionId(number).slice(1)}.png`;
        a.click();
        URL.revokeObjectURL(href);
        toast.success("Image saved");
      }
      onClose();
    } catch {
      toast.error("Couldn't create that image");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Share confession"
            className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-4 flex items-center">
              <p className="font-display font-bold">Share {formatConfessionId(number)}</p>
              <button onClick={onClose} className="tap ml-auto p-1 text-muted-foreground" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {targets.map((t) => (
                <a
                  key={t.label}
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="tap flex flex-col items-center gap-1.5 rounded-2xl border border-border p-3 text-[11px] font-semibold text-muted-foreground"
                >
                  <Link2 className="h-5 w-5 text-primary" />
                  {t.label}
                </a>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <Row icon={Share2} label="Share via…" onClick={nativeShare} />
              <Row icon={Copy} label="Copy link" onClick={copy} />
              <Row
                icon={Download}
                label={busy ? "Creating image…" : "Save confession card (1080×1350)"}
                onClick={saveImage}
              />
              {onReport && (
                <Row
                  icon={Flag}
                  label="Report this confession"
                  onClick={() => {
                    onClose();
                    onReport();
                  }}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Row({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="tap flex w-full items-center gap-3 rounded-2xl bg-elevated px-4 py-3 text-left text-sm font-semibold"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </button>
  );
}
