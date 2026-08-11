import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Flag, Heart, Loader2, MessageCircle, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  COMMENT_SORTS,
  addComment,
  deleteComment,
  editComment,
  fetchComments,
  toggleCommentLike,
  toggleCommentVote,
  type CommentNode,
  type CommentSort,
  type VoteKind,
} from "@/lib/api";
import { reportContent } from "@/lib/social";
import { timeAgo } from "@/lib/confessions";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

export function CommentThread({
  confessionId,
  confessionNumber,
}: {
  confessionId: string;
  confessionNumber?: number;
}) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sort, setSort] = useState<CommentSort>("top");
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);

  const comments = useQuery({
    queryKey: ["comments", confessionId, user?.id ?? null, sort],
    queryFn: () => fetchComments(confessionId, user?.id ?? null, sort),
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

  const vote = useMutation({
    mutationFn: ({ c, kind }: { c: CommentNode; kind: VoteKind }) =>
      toggleCommentVote(c.id, user!.id, kind, c.myVotes.includes(kind)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (c: CommentNode) => deleteComment(c.id),
    onSuccess: () => {
      toast.success("Comment deleted");
      invalidate();
    },
  });

  const edit = useMutation({
    mutationFn: ({ c, body }: { c: CommentNode; body: string }) => editComment(c.id, body),
    onSuccess: invalidate,
  });

  function requireAuth(fn: () => void) {
    if (!user) {
      toast.error("Sign in to do that");
      return;
    }
    fn();
  }


  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Comments</h2>
      </div>

      <div className="mb-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {COMMENT_SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={cn(
              "tap shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              sort === s.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
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
              viewerId={user?.id ?? null}
              onReply={(n) => requireAuth(() => setReplyTo(n))}
              onLike={(n) => requireAuth(() => like.mutate(n))}
              onVote={(n, kind) => requireAuth(() => vote.mutate({ c: n, kind }))}
              onDelete={(n) => remove.mutate(n)}
              onEdit={(n, body) => edit.mutate({ c: n, body })}
              onReport={(n) =>
                reportContent({ targetType: "comment", targetId: n.id, reason: "flagged by user", reporterId: user?.id ?? null })
                  .then(() => toast.success("Reported. Thanks for keeping it safe."))
                  .catch(() => toast.error("Couldn't send that report"))
              }
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
              <UserAvatar username={profile?.username ?? "me"} avatarPath={profile?.avatar_url} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && draft.trim() && send.mutate()}
                placeholder="Write a comment… use @username to mention"
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

/** Renders @mentions as links to the mentioned comrade's profile. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9_]{3,20})/gi);
  return (
    <p className="mt-1 text-sm leading-relaxed">
      {parts.map((part, i) =>
        /^@[a-z0-9_]{3,20}$/i.test(part) ? (
          <Link
            key={i}
            to="/u/$username"
            params={{ username: part.slice(1).toLowerCase() }}
            className="font-semibold text-primary"
          >
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function CommentItem({
  node,
  viewerId,
  onReply,
  onLike,
  onVote,
  onDelete,
  onEdit,
  onReport,
}: {
  node: CommentNode;
  viewerId: string | null;
  onReply: (n: CommentNode) => void;
  onLike: (n: CommentNode) => void;
  onVote: (n: CommentNode, kind: VoteKind) => void;
  onDelete: (n: CommentNode) => void;
  onEdit: (n: CommentNode, body: string) => void;
  onReport: (n: CommentNode) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.body);
  const isMine = viewerId === node.user_id;

  return (
    <div className={cn(node.depth > 0 && "ml-8 border-l border-border pl-3")}>
      <div className="flex gap-3">
        <Link to="/u/$username" params={{ username: node.username }} className="tap">
          <UserAvatar username={node.username} avatarPath={node.avatar_url} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            <Link to="/u/$username" params={{ username: node.username }} className="font-semibold text-foreground">
              @{node.username}
            </Link>{" "}
            · {timeAgo(node.created_at)}
          </p>

          {editing ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={() => {
                  if (value.trim()) onEdit(node, value.trim());
                  setEditing(false);
                }}
                className="tap text-xs font-bold text-primary"
              >
                Save
              </button>
              <button onClick={() => setEditing(false)} className="tap text-xs text-muted-foreground">
                Cancel
              </button>
            </div>
          ) : (
            <Body text={node.body} />
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <button
              onClick={() => onLike(node)}
              className={cn("tap flex items-center gap-1", node.likedByMe && "text-primary")}
            >
              <Heart className="h-3.5 w-3.5" fill={node.likedByMe ? "currentColor" : "none"} />
              {node.likes}
            </button>
            <button
              onClick={() => onVote(node, "helpful")}
              className={cn("tap", node.myVotes.includes("helpful") && "text-primary")}
            >
              🤝 {node.helpful}
            </button>
            <button
              onClick={() => onVote(node, "funny")}
              className={cn("tap", node.myVotes.includes("funny") && "text-primary")}
            >
              😂 {node.funny}
            </button>
            {node.depth < 2 && (
              <button onClick={() => onReply(node)} className="tap">
                Reply
              </button>
            )}
            {isMine ? (
              <>
                <button onClick={() => setEditing(true)} className="tap" aria-label="Edit comment">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onDelete(node)} className="tap" aria-label="Delete comment">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <MessageCommenter username={node.username} peerId={node.user_id} viewerId={viewerId} />
                <button onClick={() => onReport(node)} className="tap" aria-label="Report comment">
                  <Flag className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <CommentItem
              key={child.id}
              node={child}
              viewerId={viewerId}
              onReply={onReply}
              onLike={onLike}
              onVote={onVote}
              onDelete={onDelete}
              onEdit={onEdit}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}
