-- Rules tests. Runs entirely inside one block that ends by raising an exception, so
-- every change is rolled back. The results appear as the error message.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  out text := ''; tid uuid; t2 uuid; t3 uuid; tp uuid; leg uuid; n int; s text; i int; ok boolean;
  fut text := (now() + interval '1 day')::text;
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local'),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local');
  out := out || 'profiles created by signup trigger: ' || (select count(*) from profiles where id in (a,b,c)) || E'\n';

  -- ===== A builds a record: 15 wins, 7 losses =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..22 loop
    tid := post_ticket(jsonb_build_object('units', 1, 'legs', jsonb_build_array(jsonb_build_object(
      'sport','NFL','game','A @ B','market','Spread','selection','A -3','odds',-110,'starts_at',fut))));
    select id into leg from ticket_legs where ticket_id = tid;
    perform grade_leg(leg, case when i <= 15 then 'win' else 'loss' end);
  end loop;
  select status into s from leader_standing(a);
  out := out || 'A standing after 15-7: ' || s || E'\n';

  insert into creator_settings (user_id, enabled, price_cents, perks) values (a, true, 1999, '{"Every pick"}');
  out := out || 'A is selling: ' || private.is_selling(a) || E'\n';

  -- subscriber-only pending pick, with a private stake
  t2 := post_ticket(jsonb_build_object('units', 2, 'access', 'subscribers', 'stake_cents', 5000, 'analysis', 'secret',
    'legs', jsonb_build_array(jsonb_build_object('sport','NBA','game','Celtics @ Knicks','market','Total','selection','Over 221.5','odds',-105,'starts_at',fut))));
  -- 3-leg free parlay with no ticket odds given -> computed
  t3 := post_ticket(jsonb_build_object('units', 1, 'legs', jsonb_build_array(
    jsonb_build_object('sport','NFL','game','G1','market','Moneyline','selection','X ML','odds',-110,'starts_at',fut),
    jsonb_build_object('sport','NFL','game','G2','market','Moneyline','selection','Y ML','odds',-110,'starts_at',fut),
    jsonb_build_object('sport','NFL','game','G3','market','Moneyline','selection','Z ML','odds',-110,'starts_at',fut))));
  out := out || 'parlay odds computed from 3x -110: ' || (select odds from tickets where id = t3) || ' (expect ~+596)' || E'\n';
  -- practice ticket
  tp := post_ticket(jsonb_build_object('units', 1, 'is_practice', true, 'legs', jsonb_build_array(jsonb_build_object(
    'sport','MLB','game','P @ Q','market','Total','selection','Under 8.5','odds',-110,'starts_at',fut))));
  select id into leg from ticket_legs where ticket_id = tp; perform grade_leg(leg, 'loss');
  select status into s from leader_standing(a);
  out := out || 'A standing after a practice loss (should still be good, 22 decided): ' || s || ' / ' || (select decided from leader_standing(a)) || E'\n';

  -- parlay grading: win, loss, pending -> loss
  select id into leg from ticket_legs where ticket_id = t3 and position = 0; perform grade_leg(leg, 'win');
  out := out || 'parlay after 1 win: ' || (select status from tickets where id = t3) || E'\n';
  select id into leg from ticket_legs where ticket_id = t3 and position = 1; perform grade_leg(leg, 'loss');
  out := out || 'parlay after win+loss (one leg still pending): ' || (select status from tickets where id = t3) || E'\n';
  out := out || 'revisions recorded for parlay: ' || (select count(*) from ticket_revisions where ticket_id = t3) || E'\n';

  -- ===== B, a fan =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  out := out || 'B sees locked pick before subscribing: ' || (select count(*) from tickets where id = t2)
       || ', its legs: ' || (select count(*) from ticket_legs where ticket_id = t2)
       || ', preview: ' || (select count(*) from ticket_previews where id = t2) || E'\n';
  out := out || 'B sees A''s practice ticket: ' || (select count(*) from tickets where id = tp) || E'\n';
  out := out || 'B sees A''s graded record: ' || (select count(*) from tickets where user_id = a and status <> 'pending') || E'\n';
  out := out || 'B sees A''s money rows: ' || (select count(*) from ticket_money) || E'\n';
  insert into subscriptions (subscriber_id, creator_id) values (b, a);
  out := out || 'B sees locked pick after subscribing: ' || (select count(*) from tickets where id = t2)
       || ' (analysis: ' || (select analysis from tickets where id = t2) || ')' || E'\n';
  out := out || 'subscriber_count shown publicly: ' || (select subscriber_count from creator_public where user_id = a) || E'\n';
  insert into tails (ticket_id, user_id) values (t2, b);
  out := out || 'B tailed the pick: ' || (select count(*) from tails where ticket_id = t2) || E'\n';

  ok := false; begin select id into leg from ticket_legs where ticket_id = t2 limit 1; perform grade_leg(leg, 'win'); exception when others then ok := true; end;
  out := out || 'B blocked from grading A''s pick: ' || ok || E'\n';
  ok := false; begin insert into tickets (user_id, odds, units, starts_at) values (b, -110, 1, now() + interval '1 day'); exception when others then ok := true; end;
  out := out || 'B blocked from inserting tickets directly: ' || ok || E'\n';
  ok := false; begin update tickets set status = 'win' where id = t2; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  out := out || 'B blocked from changing a result: ' || ok || E'\n';
  ok := false; begin update profiles set verified = true where id = b; exception when others then ok := true; end;
  out := out || 'B blocked from making self verified: ' || ok || E'\n';
  update profiles set display_name = 'Fan B', handle = 'fan_b' where id = b;
  out := out || 'B can edit own profile: ' || (select handle from profiles where id = b) || E'\n';

  -- ===== C goes 5-15 and gets suspended =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..20 loop
    tid := post_ticket(jsonb_build_object('units', 1, 'legs', jsonb_build_array(jsonb_build_object(
      'sport','NHL','game','C @ D','market','Moneyline','selection','C ML','odds',120,'starts_at',fut))));
    select id into leg from ticket_legs where ticket_id = tid;
    perform grade_leg(leg, case when i <= 5 then 'win' else 'loss' end);
  end loop;
  out := out || 'C standing after 5-15: ' || (select status from leader_standing(c)) || E'\n';
  ok := false; begin perform post_ticket(jsonb_build_object('units', 1, 'legs', jsonb_build_array(jsonb_build_object(
      'sport','NHL','game','C @ D','market','Moneyline','selection','C ML','odds',120,'starts_at',fut)))); exception when others then ok := true; end;
  out := out || 'C blocked from posting while suspended: ' || ok || E'\n';
  ok := false; begin perform post_ticket(jsonb_build_object('units', 1, 'legs', jsonb_build_array(jsonb_build_object(
      'sport','NHL','game','C @ D','market','Moneyline','selection','C ML','odds',120,'starts_at',(now() - interval '1 hour')::text)))); exception when others then ok := true; end;
  out := out || 'posting after game start blocked: ' || ok || E'\n';

  -- ===== signed-out visitor =====
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  out := out || 'visitor sees A''s locked pick: ' || (select count(*) from tickets where id = t2) || E'\n';
  ok := false; begin perform count(*) from ticket_money; exception when insufficient_privilege then ok := true; end;
  out := out || 'visitor denied money table: ' || ok;
  ok := false; begin perform count(*) from bankroll_entries; exception when insufficient_privilege then ok := true; end;
  out := out || ', denied bankroll table: ' || ok || E'\n';
  ok := false; begin perform post_ticket('{}'::jsonb); exception when others then ok := true; end;
  out := out || 'visitor blocked from posting: ' || ok || E'\n';

  raise exception E'TEST RESULTS (rolled back)\n%', out;
end $$;
