
CREATE TABLE public.smart_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.smart_cards(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  owner text,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'manual',
  related_section_id uuid REFERENCES public.smart_sections(id) ON DELETE SET NULL,
  related_line_id uuid REFERENCES public.smart_lines(id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smart_todos_card ON public.smart_todos(card_id, order_index);
ALTER TABLE public.smart_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "smart_todos all" ON public.smart_todos USING (true) WITH CHECK (true);
CREATE TRIGGER trg_smart_todos_updated BEFORE UPDATE ON public.smart_todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.smart_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.smart_cards(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_smart_chat_card ON public.smart_chat_messages(card_id, created_at);
ALTER TABLE public.smart_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "smart_chat_messages all" ON public.smart_chat_messages USING (true) WITH CHECK (true);
