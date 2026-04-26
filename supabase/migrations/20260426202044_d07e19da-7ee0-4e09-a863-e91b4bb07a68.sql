CREATE POLICY "Brain entries deletable by anyone"
ON public.brain_entries
FOR DELETE
TO public
USING (true);