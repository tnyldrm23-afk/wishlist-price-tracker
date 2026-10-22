CREATE SCHEMA IF NOT EXISTS n8n;
CREATE SCHEMA IF NOT EXISTS tracker;
CREATE TABLE tracker.watches (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chat_id text NOT NULL, asin text NOT NULL CHECK(asin ~ '^[A-Z0-9]{10}$'), url text NOT NULL,
 title text NOT NULL, target_cents integer NOT NULL CHECK(target_cents>0),
 discount_bps integer NOT NULL CHECK(discount_bps>0 AND discount_bps<10000),
 baseline_cents integer NOT NULL CHECK(baseline_cents>0), last_price_cents integer,
 last_alert_cents integer, qualifying boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, source text NOT NULL CHECK(source IN ('demo','keepa')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(chat_id,asin,source)
);
CREATE TABLE tracker.updates (
 update_id text PRIMARY KEY, chat_id text NOT NULL, status text NOT NULL DEFAULT 'processing',
 received_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE tracker.observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,watch_id bigint REFERENCES tracker.watches(id),
 price_cents integer NOT NULL CHECK(price_cents>0), observed_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tracker.alerts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,watch_id bigint NOT NULL REFERENCES tracker.watches(id),
 price_cents integer NOT NULL, baseline_cents integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','review','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, message_id text
);
CREATE UNIQUE INDEX one_pending_alert_per_watch ON tracker.alerts(watch_id) WHERE status IN ('pending','review');
CREATE TABLE tracker.errors (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, watch_id bigint,
 stage text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION tracker.claim_update(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE inserted integer;
BEGIN
 INSERT INTO tracker.updates(update_id,chat_id) VALUES(p->>'update_id',p->>'chat_id') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 RETURN p || jsonb_build_object('claimed',inserted=1);
END $$;
CREATE FUNCTION tracker.register_watch(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE w tracker.watches; total integer; prod jsonb := p->'product';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(p->>'chat_id'));
 SELECT * INTO w FROM tracker.watches WHERE chat_id=p->>'chat_id' AND asin=p->>'asin' AND source=p->>'source' FOR UPDATE;
 IF w.id IS NOT NULL AND w.active THEN
   RETURN p || jsonb_build_object('registered',false,'reply','This product is already tracked. Remove the existing watch before changing its settings.');
 END IF;
 SELECT count(*) INTO total FROM tracker.watches WHERE chat_id=p->>'chat_id' AND active AND source=p->>'source';
 IF total>=5 THEN RETURN p||jsonb_build_object('registered',false,'reply','Your wishlist has reached the five-product limit. Remove a watch first.'); END IF;
 INSERT INTO tracker.watches(chat_id,asin,url,title,target_cents,discount_bps,baseline_cents,last_price_cents,source)
 VALUES(p->>'chat_id',p->>'asin',p->>'url',prod->>'title',(p->>'target_cents')::integer,(p->>'discount_bps')::integer,(prod->>'price_cents')::integer,(prod->>'price_cents')::integer,p->>'source')
 ON CONFLICT(chat_id,asin,source) DO UPDATE SET active=true,title=excluded.title,target_cents=excluded.target_cents,discount_bps=excluded.discount_bps,baseline_cents=excluded.baseline_cents,last_price_cents=excluded.last_price_cents,last_alert_cents=NULL,qualifying=false
 RETURNING * INTO w;
 INSERT INTO tracker.observations(watch_id,price_cents,observed_at) VALUES(w.id,(prod->>'price_cents')::integer,(prod->>'observed_at')::timestamptz);
 RETURN p||jsonb_build_object('registered',true,'watch',to_jsonb(w));
END $$;
-- Atomic comparison and alert reservation: parallel runs cannot create duplicate alerts.
-- Code calculates the user-visible decision; the transaction rechecks against locked state.
CREATE FUNCTION tracker.observe(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE w tracker.watches; aid bigint; prod jsonb:=p->'product'; current_price integer:=(prod->>'price_cents')::integer;
 target_hit boolean; drop_hit boolean; qualifies boolean; baseline integer; should_send boolean; pending boolean;
BEGIN
 SELECT * INTO w FROM tracker.watches WHERE id=(p->'watch'->>'id')::bigint FOR UPDATE;
 IF w.id IS NULL OR NOT w.active THEN RETURN p||jsonb_build_object('should_send',false); END IF;
 IF (prod->>'asin')<>w.asin OR current_price<=0 THEN RAISE EXCEPTION 'Invalid observation'; END IF;
 baseline=greatest(w.baseline_cents,current_price);
 target_hit=current_price<=w.target_cents;
 drop_hit=(baseline-current_price)::bigint*10000>=baseline::bigint*w.discount_bps;
 qualifies=target_hit OR drop_hit;
 SELECT EXISTS(SELECT 1 FROM tracker.alerts WHERE watch_id=w.id AND status IN('pending','review')) INTO pending;
 should_send=qualifies AND (NOT w.qualifying OR w.last_alert_cents IS NULL OR current_price<w.last_alert_cents) AND NOT pending;
 INSERT INTO tracker.observations(watch_id,price_cents,observed_at) VALUES(w.id,current_price,(prod->>'observed_at')::timestamptz);
 UPDATE tracker.watches SET baseline_cents=baseline,last_price_cents=current_price,qualifying=qualifies WHERE id=w.id;
 IF should_send THEN INSERT INTO tracker.alerts(watch_id,price_cents,baseline_cents) VALUES(w.id,current_price,baseline) RETURNING id INTO aid; END IF;
 RETURN p||jsonb_build_object('should_send',should_send,'alert_id',aid,'watch',to_jsonb(w),'decision',jsonb_build_object('baseline_cents',baseline,'price_cents',current_price,'drop_percent',round((baseline-current_price)*100.0/baseline,2),'target_met',target_hit,'significant_drop',drop_hit,'qualifies',qualifies));
END $$;
CREATE FUNCTION tracker.finish_alert(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a tracker.alerts;
BEGIN
 SELECT * INTO a FROM tracker.alerts WHERE id=(p->>'alert_id')::bigint FOR UPDATE;
 IF a.id IS NULL THEN RETURN p; END IF;
 IF (p->>'delivered')::boolean THEN
   UPDATE tracker.alerts SET status='sent',sent_at=now(),message_id=p->>'message_id' WHERE id=a.id;
   UPDATE tracker.watches SET last_alert_cents=a.price_cents WHERE id=a.watch_id;
 ELSE
   UPDATE tracker.alerts SET status='review' WHERE id=a.id;
   INSERT INTO tracker.errors(watch_id,stage,message) VALUES(a.watch_id,'delivery','Delivery not confirmed; review before retrying');
 END IF;
 RETURN p;
END $$;
