-- Creates the DEMO community (run once; safe to re-run only after private.scrub_demo()).
-- Requires migration 0003_demo_accounts.sql.
do $$
declare
  p record;
  uid uuid;
  i int;
begin
  if exists (select 1 from public.profiles where is_demo) then
    raise exception 'Demo accounts already exist. Run select private.scrub_demo(); first.';
  end if;
  perform setseed(0.52);

  for p in
    select * from (values
      ('sharpside',      'Sharp Side Sam',  'Former oddsmaker. NFL and college football sides and totals.', '#22c55e', true,  0.62, '{NFL,NCAAF}'::text[],        '{Spread,Spread,Total,Moneyline}'::text[], 0.05, 2, false, 64, 1999),
      ('courtvision',    'Court Vision',    'NBA and college hoops. I watch every game so you don''t have to.', '#f97316', true, 0.60, '{NBA,NCAAB}', '{Spread,Total,"Player Prop","Player Prop"}', 0.10, 3, false, 58, 1499),
      ('icecoldlocks',   'Ice Cold Locks',  'Hockey nerd. Puck lines and shots-on-goal props.',            '#38bdf8', false, 0.58, '{NHL}',                       '{Spread,Moneyline,"Player Prop"}',         0.05, 2, false, 41, 999),
      ('diamonddata',    'Diamond Data',    'Stat-driven MLB plays. Process over results.',                '#a855f7', false, 0.56, '{MLB}',                       '{Moneyline,Total,"Player Prop"}',          0.05, 2, false, 47, 1299),
      ('propqueen',      'Prop Queen',      'Player props only. NBA and NFL.',                             '#f43f5e', false, 0.58, '{NBA,NFL}',                   '{"Player Prop"}',                          0.15, 2, false, 45, 999),
      ('gobirds52',      'Go Birds 52',     'Philly everything. Mostly Eagles, sometimes Sixers.',         '#10b981', false, 0.52, '{NFL,NBA}',                   '{Spread,Moneyline,Total}',                 0.10, 2, false, 33, null),
      ('pitchside',      'Pitchside',       'Premier League and Champions League.',                        '#eab308', false, 0.60, '{Soccer}',                    '{Moneyline,Total,"Player Prop",Spread}',   0.10, 2, false, 26, 799),
      ('underdogdan',    'Underdog Dan',    'Plus money or nothing. Lower hit rate, bigger paydays.',      '#0ea5e9', false, 0.45, '{MLB,NHL}',                   '{Moneyline}',                              0.00, 2, true,  40, 699),
      ('fademe_parlays', 'Fade Me Parlays', 'Long-shot parlays. Ride or die.',                             '#ef4444', false, 0.66, '{NFL,NBA,NHL,Soccer}',        '{Spread,Moneyline,Total}',                 0.85, 2, false, 36, 499),
      ('lock_king99',    'Lock King',       '100% locks 🔒 DM for VIP',                                     '#64748b', false, 0.22, '{NFL,NBA,MLB}',               '{Moneyline,Spread}',                       0.00, 0, false, 30, 4999),
      ('rookie_rob',     'Rookie Rob',      'New here, learning the ropes.',                               '#d946ef', false, 0.55, '{NFL}',                       '{Spread,Moneyline}',                       0.00, 1, false, 8,  null)
    ) as v (handle, name, bio, color, verified, skill, sports, markets, parlay, open, dog, graded, price)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'demo+' || p.handle || '@example.com', '', now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', p.name),
      now() - interval '150 days', now(), '', '', '', '');

    update public.profiles
       set handle = p.handle, display_name = p.name, bio = p.bio, avatar_color = p.color,
           verified = p.verified, is_demo = true, created_at = now() - interval '150 days'
     where id = uid;

    insert into private.demo_personas (user_id, leg_skill, sports, markets, parlay_rate, target_open, underdog)
    values (uid, p.skill, p.sports, p.markets, p.parlay, p.open, p.dog);

    if p.price is not null then
      insert into public.creator_settings (user_id, enabled, price_cents, perks)
      values (uid, true, p.price, '{"Every pick, before the line moves","Full write-ups on each play","Subscriber-only chat"}');
    end if;

    -- History spread over the last ~4 months.
    for i in 1..p.graded loop
      perform private.demo_make_ticket(uid,
        date_trunc('hour', now() - make_interval(days => ((p.graded - i + 1) * 110 / p.graded)::int,
                                                 hours => floor(random() * 12)::int)),
        true);
    end loop;
  end loop;

  -- Demo accounts follow and subscribe to each other.
  insert into public.follows (follower_id, followee_id)
  select a.user_id, b.user_id from private.demo_personas a, private.demo_personas b
  where a.user_id <> b.user_id and random() < 0.4;

  insert into public.subscriptions (subscriber_id, creator_id)
  select a.user_id, b.user_id from private.demo_personas a, private.demo_personas b
  where a.user_id <> b.user_id and private.is_selling(b.user_id) and random() < 0.35;

  -- Open picks for the feed, then keep it fresh every hour.
  perform private.demo_tick();
  perform cron.schedule('demo-tick', '17 * * * *', 'select private.demo_tick()');
end $$;
