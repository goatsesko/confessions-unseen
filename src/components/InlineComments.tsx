import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addComment, fetchComments, toggleCommentLike, type CommentNode } from "@/lib/api";
import { timeAgo } from "@/lib/confessions";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

/**
 * Compact, expandable comment thread used inside community feed cards.
 * Supports nested replies without leaving the feed.
 */
export function InlineComments({
  confessionId,
  confessionNumber,
}: {
  confessionId: string;
  confessionNumber: number;
}) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);

  const comments = useQuery({
    queryKey: ["comments", confessionId, user?.id ?? null, "top"],
    queryFn: () => fetchComments(confessionId, user?.id ?? null, "top"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["comments", confessionId] });

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      await addComment({
        confessionId,
        confessionNumber,
        userId: user.id,
        username: profile?.username,
        body: draft.trim(),
        parentId: replyTo?.id ?? null,
        parentUserId: replyTo?.user_id ?? null,
        depth: replyTo ? Math.min(2, replyTo.depth + 1) : 0,
      });
    },
    onSuccess: () => {
      setDraft("");
      setReplyTo(null);
      invalidate();
    },
    onError: () => toast.error("Couldn't post your comment"),
  });

  const like = useMutation({
    mutationFn: (c: CommentNode) => toggleCommentLike(c.id, user!.id, c.likedByMe, c.user_id),
    onSuccess: invalidate,
  });

  return (
    <div className="mt-3 border-t border-border pt-3">
      {comments.isLoading ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Loading comments…</p>
      ) : (comments.data ?? []).length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">No replies yet. Be the first to help.</p>
      ) : (
        <div className="space-y-3">
          {(comments.data ?? []).map((c) => (
            <Node
              key={c.id}
              node={c}
              onReply={(n) => (user ? setReplyTo(n) : toast.error("Sign in to reply"))}
              onLike={(n) => (user ? like.mutate(n) : toast.error("Sign in to like"))}
            />
          ))}
        </div>
      )}

      {user ? (
        <div className="mt-3">
          {replyTo && (
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              Replying to @{replyTo.username}{" "}
              <button className="tap text-primary" onClick={() => setReplyTo(null)}>
                cancel
              </button>
            </p>
          )}
          <div className="flex items-center gap-2">
            <UserAvatar username={profile?.username ?? "me"} avatarPath={profile?.avatar_url} />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && draft.trim() && send.mutate()}
              placeholder="Write a reply…"
              className="h-10 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              disabled={!draft.trim() || send.isPending}
              onClick={() => send.mutate()}
              aria-label="Send reply"
              className="tap flex h-10 w-10 items-center justify-center rounded-full bg-primary disabled:opacity-40"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
              ) : (
                <Send className="h-4 w-4 text-primary-foreground" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <Link to="/auth" className="tap mt-3 block text-center text-xs font-bold text-primary">
          Sign in to reply
        </Link>
      )}
    </div>
  );
}

function Node({
  node,
  onReply,
  onLike,
}: {
  node: CommentNode;
  onReply: (n: CommentNode) => void;
  onLike: (n: CommentNode) => void;
}) {
  return (
    <div className={cn(node.depth > 0 && "ml-7 border-l border-border pl-3")}>
      <div className="flex gap-2.5">
        <Link to="/u/$username" params={{ username: node.username }} className="tap">
          <UserAvatar username={node.username} avatarPath={node.avatar_url} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">
            <Link to="/u/$username" params={{ username: node.username }} className="font-semibold text-foreground">
              @{node.username}
            </Link>{" "}
            · {timeAgo(node.created_at)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{node.body}</p>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-muted-foreground">
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
        <div className="mt-2.5 space-y-2.5">
          {node.children.map((child) => (
            <Node key={child.id} node={child} onReply={onReply} onLike={onLike} />
          ))}
        </div>
      )}
    </div>
  );
}
