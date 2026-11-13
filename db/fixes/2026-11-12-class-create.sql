-- Creating a class failed for everyone: RETURNING checked the select policy before the trigger made the owner a member.
drop policy if exists "members see their classes" on public.cr_classes;
create policy "members see their classes" on public.cr_classes for select to authenticated using (owner = auth.uid() or cr_is_member(id));
