-- Social rules test. Like rules_test.sql, everything is rolled back; results appear as the error message.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  out text := ''; f uuid; s uuid; pr uuid; tid uuid; leg uuid; cm uuid; i int; ok boolean; n int;
  fut text := (now() + interval '1 day')::text;
  one jsonb := jsonb_build_array(jsonb_build_object('sport','NFL','game','A @ B','market','Spread','selection','A -3','odds',-110,'starts_at',(now() + interval '1 day')::text));
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa@test.local'),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sb@test.local'),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc@test.local');

  -- A: ranked creator selling subscriptions, with a free, a subscriber-only and a practice ticket.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..22 loop
    tid := post_ticket(jsonb_build_object('units', 1, 'legs', one));
    select id into leg from ticket_legs where ticket_id = tid;
    perform grade_leg(leg, case when i <= 15 then 'win' else 'loss' end);
  end loop;
  insert into creator_settings (user_id, enabled) values (a, true);
  f := post_ticket(jsonb_build_object('units', 1, 'legs', one));
  s := post_ticket(jsonb_build_object('units', 1, 'access', 'subscribers', 'legs', one));
  pr := post_ticket(jsonb_build_object('units', 1, 'is_practice', true, 'legs', one));
  ok := false; begin insert into ticket_reposts (ticket_id, user_id) values (f, a); exception when others then ok := true; end;
  out := out || 'A blocked from reposting own ticket: ' || ok || E'\n';

  -- B: a fan, not subscribed.
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into ticket_reactions (ticket_id, user_id, kind) values (f, b, 'like');
  update ticket_reactions set kind = 'dislike' where ticket_id = f and user_id = b;
  out := out || 'B switched like to dislike: ' || (select kind from ticket_reactions where ticket_id = f and user_id = b) || E'\n';
  insert into ticket_comments (ticket_id, user_id, body) values (f, b, 'Fade this') returning id into cm;
  insert into ticket_reposts (ticket_id, user_id) values (f, b);
  insert into ticket_saves (ticket_id, user_id) values (f, b);
  insert into comment_reports (comment_id, reporter_id, reason) values (cm, b, 'test');
  insert into user_blocks (blocker_id, blocked_id) values (b, c);
  ok := false; begin insert into ticket_reactions (ticket_id, user_id, kind) values (s, b, 'like'); exception when others then ok := true; end;
  out := out || 'B blocked from reacting to a locked ticket: ' || ok || E'\n';
  ok := false; begin insert into ticket_comments (ticket_id, user_id, body) values (s, b, 'x'); exception when others then ok := true; end;
  out := out || 'B blocked from commenting on a locked ticket: ' || ok || E'\n';
  ok := false; begin insert into ticket_comments (ticket_id, user_id, body) values (pr, b, 'x'); exception when others then ok := true; end;
  out := out || 'B blocked from commenting on a practice ticket: ' || ok || E'\n';
  ok := false; begin insert into ticket_reactions (ticket_id, user_id, kind) values (f, c, 'like'); exception when others then ok := true; end;
  out := out || 'B blocked from reacting as someone else: ' || ok || E'\n';
  out := out || 'counts on free ticket (likes/dislikes/comments/reposts): '
       || (select likes || '/' || dislikes || '/' || comments || '/' || reposts from ticket_social where ticket_id = f) || E'\n';
  out := out || 'locked ticket still shows counts: ' || (select count(*) from ticket_social where ticket_id = s) || E'\n';
  out := out || 'practice ticket has no counts row: ' || (select count(*) = 0 from ticket_social where ticket_id = pr) || E'\n';

  -- C: someone else.
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || 'C sees B''s reaction rows: ' || (select count(*) from ticket_reactions) || ', saves: ' || (select count(*) from ticket_saves)
       || ', blocks: ' || (select count(*) from user_blocks) || E'\n';
  out := out || 'C sees the comment and repost: ' || (select count(*) from ticket_comments where ticket_id = f) || '/' || (select count(*) from ticket_reposts where ticket_id = f) || E'\n';
  ok := false; begin perform count(*) from comment_reports; exception when insufficient_privilege then ok := true; end;
  out := out || 'C cannot read reports: ' || ok || E'\n';
  delete from ticket_comments where id = cm; get diagnostics n = row_count;
  out := out || 'C cannot delete B''s comment: ' || (n = 0) || E'\n';

  -- A deletes B's comment on A's own ticket.
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from ticket_comments where id = cm; get diagnostics n = row_count;
  out := out || 'creator can delete a comment on their ticket: ' || (n = 1) || E'\n';

  -- Signed-out visitor.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  out := out || 'visitor sees counts and reposts: ' || (select count(*) > 0 from ticket_social where ticket_id = f) || '/' || (select count(*) from ticket_reposts where ticket_id = f) || E'\n';
  ok := false; begin insert into ticket_reactions (ticket_id, user_id, kind) values (f, b, 'like'); exception when others then ok := true; end;
  out := out || 'visitor blocked from reacting: ' || ok || E'\n';

  raise exception E'SOCIAL TEST RESULTS (rolled back)\n%', out;
end $$;
