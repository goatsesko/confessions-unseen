import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addComment, fetchComments, toggleCommentLike, type CommentNode } from "@/lib/api";
import { timeAgo } from "@/lib/confessions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-bold uppercase text-primary">
      {name.slice(0, 2)}
    </div>
  );
}

export function CommentThread({ confessionId }: { confessionId: string }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);

  const comments = useQuery({
    queryKey: ["comments", confessionId, user?.id ?? null],
    queryFn: () => fetchComments(confessionId, user?.id ?? null),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      await addComment({
        confessionId,
        userId: user.id,
        body: draft.trim(),
        parentId: replyTo?.id ?? null,
        depth: replyTo ? Math.min(2, replyTo.depth + 1) : 0,
      });
    },
    onSuccess: () => {
      setDraft("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["comments", confessionId] });
    },
    onError: () => toast.error("Couldn't post your comment"),
  });

  const like = useMutation({
    mutationFn: (c: CommentNode) => toggleCommentLike(c.id, user!.id, c.likedByMe),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", confessionId] }),
  });

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Top comments</h2>
        <span className="text-xs text-muted-foreground">Newest</span>
      </div>

      {comments.isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (comments.data ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Say something real.</p>
      ) : (
        <div className="space-y-4">
          {(comments.data ?? []).map((c) => (
            <CommentItem
              key={c.id}
              node={c}
              onReply={setReplyTo}
              onLike={(n) => (user ? like.mutate(n) : toast.error("Sign in to like comments"))}
            />
          ))}
        </div>
      )}

      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="mx-auto max-w-2xl px-4">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              Replying to @{replyTo.username}
              <button className="tap text-primary" onClick={() => setReplyTo(null)}>
                cancel
              </button>
            </div>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <Avatar name={profile?.username ?? "me"} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && draft.trim() && send.mutate()}
                placeholder="Write a comment…"
                className="h-11 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                disabled={!draft.trim() || send.isPending}
                onClick={() => send.mutate()}
                aria-label="Send comment"
                className="tap flex h-11 w-11 items-center justify-center rounded-full bg-primary disabled:opacity-40"
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                ) : (
                  <Send className="h-4 w-4 text-primary-foreground" />
                )}
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="tap flex h-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
            >
              Sign in to comment
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function CommentItem({
  node,
  onReply,
  onLike,
}: {
  node: CommentNode;
  onReply: (n: CommentNode) => void;
  onLike: (n: CommentNode) => void;
}) {
  return (
    <div className={cn(node.depth > 0 && "ml-8 border-l border-border pl-3")}>
      <div className="flex gap-3">
        <Avatar name={node.username} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">@{node.username}</span> · {timeAgo(node.created_at)}
          </p>
          <p className="mt-1 text-sm leading-relaxed">{node.body}</p>
          <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
            <button
              onClick={() => onLike(node)}
              className={cn("tap flex items-center gap-1", node.likedByMe && "text-primary")}
            >
              <Heart className="h-3.5 w-3.5" fill={node.likedByMe ? "currentColor" : "none"} />
              {node.likes}
            </button>
            {node.depth < 2 && (
              <button onClick={() => onReply(node)} className="tap">
                Reply
              </button>
            )}
          </div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <CommentItem key={child.id} node={child} onReply={onReply} onLike={onLike} />
          ))}
        </div>
      )}
    </div>
  );
}
