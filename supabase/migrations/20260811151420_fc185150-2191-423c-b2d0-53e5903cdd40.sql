-- Messaging privacy settings on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS msg_privacy text NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS show_online boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_read_receipts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_images boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_voice boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_msg_privacy_check
    CHECK (msg_privacy IN ('everyone','followers','following','nobody'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-conversation preferences
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

-- Delivery tracking
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON public.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conversation ON public.conversation_members (conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation ON public.message_reactions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_blocks_pair ON public.blocks (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS idx_follows_pair ON public.follows (follower_id, following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);