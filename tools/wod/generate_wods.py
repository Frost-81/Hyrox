"""Generate 365 hybrid race workouts of the day (40-48 min each)."""
import json, random, math, hashlib, sys

SEED = 20270424
rng = random.Random(SEED)

# ---------------------------------------------------------------- movements
# unit: m (distance), cal (M/W calories), reps. sec = estimated seconds per unit
# for a ~1:05-1:15 hybrid race athlete, used to size for-time workouts.
MV = {
    'run':        dict(name='run', unit='m', sec=0.30, rnd=100, mn=200),
    'row':        dict(name='row', unit='m', sec=0.24, rnd=50, mn=250),
    'ski':        dict(name='SkiErg', unit='m', sec=0.25, rnd=50, mn=250),
    'bike':       dict(name='BikeErg', unit='m', sec=0.11, rnd=250, mn=1000),
    'row_cal':    dict(name='row', unit='cal', sec=4.0),
    'ski_cal':    dict(name='SkiErg', unit='cal', sec=4.5),
    'bike_cal':   dict(name='assault/echo bike', unit='cal', sec=3.5),
    'wall_ball':  dict(name='wall balls', unit='reps', sec=3.0, w='6/4 kg'),
    'wb_pp':      dict(name='wall balls ping-pong (partners alternate reps)', unit='reps', sec=3.2, w='6/4 kg'),
    'bbj':        dict(name='burpee broad jumps', unit='reps', sec=5.0),
    'bbj_m':      dict(name='burpee broad jumps', unit='m', sec=3.3, rnd=10, mn=10),
    'burpee':     dict(name='burpees', unit='reps', sec=4.0),
    'burpee_row': dict(name='burpees over the rower', unit='reps', sec=5.0),
    'burpee_box': dict(name='burpee box jump-overs', unit='reps', sec=5.0, w='24/20 in'),
    'burpee_db':  dict(name='burpee dual-DB step-overs', unit='reps', sec=5.5, w='2x22.5/15 kg'),
    'burpee_tgt': dict(name='burpees to target', unit='reps', sec=4.2),
    'sled_push':  dict(name='sled push', unit='m', sec=3.6, rnd=12.5, mn=12.5, w='152/102 kg', light='sled_push_l'),
    'sled_push_l':dict(name='sled push', unit='m', sec=2.7, rnd=12.5, mn=12.5, w='105/70 kg'),
    'sled_push_h':dict(name='heavy sled push', unit='m', sec=4.4, rnd=12.5, mn=12.5, w='+10% race weight'),
    'sled_pull':  dict(name='sled pull', unit='m', sec=4.0, rnd=12.5, mn=12.5, w='103/78 kg', light='sled_pull_l'),
    'sled_pull_l':dict(name='sled pull', unit='m', sec=3.0, rnd=12.5, mn=12.5, w='70/55 kg'),
    'farmers':    dict(name='farmers carry', unit='m', sec=0.55, rnd=25, mn=50, w='2x24/2x16 kg'),
    'sb_lunge':   dict(name='sandbag walking lunges', unit='m', sec=3.0, rnd=5, mn=10, w='20/10 kg'),
    'lunge':      dict(name='walking lunges', unit='m', sec=2.4, rnd=5, mn=10),
    'kb_swing':   dict(name='KB swings', unit='reps', sec=2.2, w='24/16 kg'),
    'db_thruster':dict(name='DB thrusters', unit='reps', sec=3.0, w='2x15/10 kg'),
    'db_snatch':  dict(name='alternating DB snatches', unit='reps', sec=3.0, w='22.5/15 kg'),
    'goblet_lunge':dict(name='goblet lunges', unit='reps', sec=2.6, w='22.5/15 kg'),
    'db_pp':      dict(name='DB push press', unit='reps', sec=2.2, w='2x15/10 kg'),
    'farmer_lunge':dict(name='DB farmers lunges', unit='m', sec=2.8, rnd=5, mn=10, w='2x22.5/15 kg'),
    'box_step':   dict(name='box step-overs', unit='reps', sec=3.0, w='24/20 in'),
    'push_up':    dict(name='push-ups', unit='reps', sec=2.5),
    'v_up':       dict(name='V-ups', unit='reps', sec=2.5),
    'sit_up':     dict(name='sit-ups', unit='reps', sec=2.0),
    'air_squat':  dict(name='air squats', unit='reps', sec=1.8),
}
TRANSITION = 10  # seconds between movements
# Every fixed interval (EMOM, every n min, x min on) leaves at least this share of it to rest, so an
# athlete about 25% slower than the estimates above still finishes the work inside the interval.
REST_SHARE = 0.2
FIT_MISSES = []  # intervals that still overflow after fitting (printed at the end)


def rnd_qty(k, q):
    m = MV[k]
    if m['unit'] == 'cal':
        return max(5, int(round(q)))
    if m['unit'] == 'reps':
        q = max(4, q)
        return int(round(q / 5.0) * 5) if q >= 20 else int(round(q / 2.0) * 2)
    r = m['rnd']
    if r == 12.5 and q > 50:
        r = 25
    return max(m['mn'], round(q / r) * r)


def fmt_num(x):
    return str(int(x)) if float(x).is_integer() else str(x)


def text(k, q=None, mx=False, tail=''):
    m = MV[k]
    w = f" ({m['w']})" if m.get('w') else ''
    if mx:
        s = f"max {'cal ' if m['unit']=='cal' else ''}{m['name']}{w}"
    elif m['unit'] == 'cal':
        s = f"{q}/{max(4, round(q*0.75))} cal {m['name']}"
    elif m['unit'] == 'm':
        s = f"{fmt_num(q)} m {m['name']}{w}"
    else:
        s = f"{q} {m['name']}{w}"
    return s + (f" {tail}" if tail else '')


def est(k, q):
    return MV[k]['sec'] * q


def for_sec(k, sec):
    return rnd_qty(k, sec / MV[k]['sec'])


# ---------------------------------------------------------------- pools
STRENGTH = ['sled_push', 'sled_pull', 'farmers', 'sb_lunge', 'wall_ball', 'kb_swing',
            'db_thruster', 'goblet_lunge', 'db_pp', 'db_snatch', 'farmer_lunge']
RACE_ST = ['sled_push', 'sled_pull', 'farmers', 'sb_lunge', 'wall_ball', 'bbj']
ERG_M = ['row', 'ski', 'bike']
ERG_CAL = ['row_cal', 'ski_cal', 'bike_cal']
BURPEES = ['bbj', 'burpee', 'burpee_row', 'burpee_box', 'burpee_db', 'burpee_tgt']
CORE = ['v_up', 'sit_up', 'push_up', 'air_squat']
ANY_ST = STRENGTH + BURPEES


def pick(pool, n=1, exclude=()):
    p = [x for x in pool if x not in exclude]
    return rng.sample(p, n)


TEAM_SPLIT = 'Run together, side by side. Split the station work however you like, one partner working at a time, and swap often.'
NO_SCALE = {'run'}


class W:
    """Workout builder. Items are kept raw so a solo and a team version can be rendered.

    Item forms: str | (key, qty, max?, tail) | list of parts | callable(scale) -> str.
    Strings or tails starting with 'T:' only show in the team version, 'S:' only in solo.
    """
    def __init__(self, fmt, headline, duration, intensity, theme, native='solo', tf=1.4, sf=0.5, team_how=TEAM_SPLIT,
                 solo_how=None):
        self.d = dict(format=fmt, durationMin=duration, intensity=intensity, theme=theme, movements=set(),
                      scoring='', scheme=None)
        self.headline = headline
        self.native, self.tf, self.sf = native, tf, sf
        self.team_how, self.solo_how = team_how, solo_how
        self.blocks = []
        self.extra_est = None
        self.repeat = 1

    def block(self, items, label=None, scheme=None, rest=None, tf=None, sf=None, team_how=None, reps=1,
              window=None, per_item=False, lead=0, solo_pace=False):
        """window: seconds in each fixed interval (or {mode: seconds}); the work is fitted to it.
        per_item: each item after the first `lead` ones is its own interval, done after the lead items
        (EMOM minutes, odd/even rounds); otherwise the whole block is one interval.
        solo_pace: in the team version one partner does all of an interval's work, so time it as solo."""
        def collect(it):
            if isinstance(it, tuple):
                self.d['movements'].add(MV[it[0]]['name'].split(' (')[0])
            elif isinstance(it, list):
                for p in it: collect(p)
        for it in items: collect(it)
        self.blocks.append(dict(items=items, label=label, scheme=scheme, rest=rest, tf=tf, sf=sf, team_how=team_how, reps=reps,
                                window=window, per_item=per_item, lead=lead, solo_pace=solo_pace))
        return self

    def scale_for(self, b, mode):
        if mode == self.native:
            return 1.0
        if mode == 'team':
            return b['tf'] if b['tf'] is not None else self.tf
        return b['sf'] if b['sf'] is not None else self.sf

    def render_item(self, it, scale, mode, acc, light=False):
        if callable(it):
            return it(scale)
        if isinstance(it, str):
            if it.startswith('T:'): return it[2:] if mode == 'team' else None
            if it.startswith('S:'): return it[2:] if mode == 'solo' else None
            return it
        if isinstance(it, list):
            parts = [self.render_item(p, scale, mode, acc, light) for p in it]
            return ''.join(p for p in parts if p)
        k, q, *rest = it
        is_max = rest[0] if rest else False
        tail = rest[1] if len(rest) > 1 else ''
        if mode == 'solo' and k == 'wb_pp':
            k = 'wall_ball'
        if light:
            k = MV[k].get('light', k)
        if q is not None and k not in NO_SCALE and scale != 1.0:
            q = rnd_qty(k, q * scale)
        if q is not None:
            # team: one partner works at a time but is fresher, roughly 15% faster
            acc[0] += est(k, q) * (0.85 if mode == 'team' and k not in NO_SCALE else 1) + TRANSITION
        if tail.startswith('T:'):
            tail = tail[2:] if mode == 'team' else ''
        elif tail.startswith('S:'):
            tail = tail[2:] if mode == 'solo' else ''
        return text(k, q, is_max, tail)

    def item_est(self, it, scale, light, mode):
        acc = [0.0]
        self.render_item(it, scale, mode, acc, light)
        return acc[0]

    def fit_window(self, b, sc, mode):
        """[scale, light] per item, so each fixed interval of the block leaves REST_SHARE of it to rest.
        Station work shrinks first; a sled already down to one length switches to a lighter load."""
        out = [[sc, False] for _ in b['items']]
        win = b['window'].get(mode) if isinstance(b['window'], dict) else b['window']
        if not win:
            return out
        n, lead = len(b['items']), b['lead']
        pace = 'solo' if b['solo_pace'] else mode
        groups = [list(range(lead)) + [i] for i in range(lead, n)] if b['per_item'] else [list(range(n))]
        budget = (1 - REST_SHARE) * win
        for g in groups:
            work = [i for i in g if i >= lead or not b['per_item']]
            for light in (False, True):
                for i in work:
                    out[i] = [sc, light]
                for _ in range(40):
                    t = sum(self.item_est(b['items'][i], *out[i], pace) for i in g)
                    if t <= budget:
                        break
                    for i in work:
                        out[i][0] *= 0.94
                if t <= budget:
                    break
            if t > budget:
                FIT_MISSES.append((self.headline if isinstance(self.headline, str) else self.headline(1.0), mode, win, round(t)))
        return out

    def variant(self, mode):
        total = 0.0
        blocks = []
        hs = self.tf if (mode == 'team' and self.native == 'solo') else (self.sf if mode == 'solo' and self.native == 'team' else 1.0)
        for b in self.blocks:
            sc = self.scale_for(b, mode)
            acc = [0.0]
            fit = self.fit_window(b, sc, mode)
            items = [x for x in (self.render_item(i, s, mode, acc, light) for i, (s, light) in zip(b['items'], fit)) if x]
            total += acc[0] * b['reps']
            nb = dict(items=items)
            if b['label']: nb['label'] = b['label']
            scheme = b['scheme'](sc) if callable(b['scheme']) else b['scheme']
            if scheme: nb['scheme'] = scheme
            if b['rest']: nb['rest'] = b['rest']
            if mode == 'team' and b['team_how']: nb['teamNote'] = b['team_how']
            blocks.append(nb)
        if self.extra_est:
            st, other = self.extra_est(hs)
            total += st * (0.85 if mode == 'team' else 1) + other
        head = self.headline(hs) if callable(self.headline) else self.headline
        if mode == 'team':
            head = 'Team of 2: ' + head
        how = self.team_how if mode == 'team' else self.solo_how
        v = dict(headline=head, howTo=how, scheme=self.d.get('scheme'), blocks=blocks, scoring=self.d['scoring'])
        v['text'] = render(v)
        return v, total


def mx(k):
    return (k, None, True)


# ---------------------------------------------------------------- templates
# Each returns a W. `L` = load multiplier for the week.
# Team versions of solo workouts add volume (tf) and say how partners share it;
# solo versions of team workouts scale volume down (sf).

YGIG = 'You go, I go: '


def t_enmom(L, intensity):
    opts = [(3, 45, 5), (3, 45, 3), (3, 48, 4), (4, 48, 4), (4, 48, 3),
            (4, 40, 5), (5, 45, 3), (6, 48, 4), (8, 40, 1)]
    n, T, k = rng.choice(opts)
    rounds = T // n // k
    w = W(f'E{n}MOM', f'E{n}MOM for {T} min', T, intensity, 'Strength endurance', tf=1.4,
          team_how='Start each interval together. ' + TEAM_SPLIT)
    if k == 1:  # screenshot style E8MOM: run + 3 stations
        sts = [pick(BURPEES)[0], pick(ERG_M)[0], pick(STRENGTH)[0]]
        budget = n * 60 * 0.72 * L - est('run', 400) - 3 * TRANSITION
        items = [('run', 400)]
        for s in sts:
            items.append((s, for_sec(s, budget / 3)))
        w.block(items, scheme=f'{rounds} rounds, start every {n} min', window=n * 60)
        w.d['scoring'] = 'Slowest round time (aim to have 1:30 or more rest each round)'
        w.d['movements'].add('run')
        return w
    sts = ['run'] + pick(STRENGTH, k - 1) if rng.random() < 0.7 else pick(ERG_M, 1) + pick(STRENGTH, k - 1)
    rng.shuffle(sts)
    for i, s in enumerate(sts):
        frac = (rng.uniform(0.55, 0.68) if n <= 4 else rng.uniform(0.45, 0.55)) * (L if s != 'run' else 1)
        q = for_sec(s, n * 60 * frac)
        items = [(s, q)]
        if n >= 4 and s != 'run' and MV[s]['unit'] != 'm' or (n >= 5 and s != 'run'):
            # longer windows: pair a short run before the station
            q2 = for_sec(s, n * 60 * frac - est('run', 200) - TRANSITION)
            items = [('run', 200), (s, q2)]
        w.block(items, label=f'Block {i+1}', window=n * 60)
    w.d['scheme'] = f'Rotate through the {k} blocks, {rounds} times'
    w.d['scoring'] = 'Complete every interval; note the slowest one'
    return w


def t_emom_cycle(L, intensity):
    T = rng.choice([40, 44, 48])
    k = 4
    sts = pick(['row_cal', 'ski_cal', 'bike_cal'], 1) + pick(STRENGTH, 2) + rng.choice([['run'], pick(BURPEES, 1)])
    w = W('EMOM', f'EMOM {T}', T, intensity, 'Strength endurance', tf=1.3,
          team_how=YGIG + 'inside each minute, P1 starts and P2 finishes the reps (split as you wish). '
                          'Any run is done together.')
    items = []
    for s in sts:
        if s == 'run':
            items.append(('run', 100))
        else:
            items.append((s, for_sec(s, rng.uniform(36, 44) * L)))
    w.block(items, scheme=f'Minute 1-4 rotation, {T // 4} rounds', window=60, per_item=True)
    w.d['scoring'] = 'Rounds completed inside the minute'
    return w


def t_strength_metcon(L, intensity):
    a_opts = [(2, 8), (3, 5), (2.5, 6), (3, 6)]
    every, sets = rng.choice(a_opts)
    A = every * sets
    T = rng.choice([40, 42, 44, 45, 46, 48])
    pair = rng.choice([['sled_push_h', 'sled_pull'], ['sled_push_h', 'farmers'],
                       ['farmers', 'goblet_lunge'], ['sb_lunge', 'sled_pull'],
                       ['farmer_lunge', 'db_pp'], ['sled_push_h', 'sb_lunge']])
    # Even the smallest amounts (one sled length) must leave rest in the interval: lengthen it if not.
    while sum(est(p, rnd_qty(p, 0)) + TRANSITION for p in pair) > (1 - REST_SHARE) * every * 60:
        every += 0.5
    if every * sets != A:
        sets = max(4, round(A / every))
        A = every * sets
    B = int(T - A - 3)
    w = W('Strength + AMRAP', f'Part A: every {fmt_num(every)} min x {sets} | Part B: AMRAP {B} min', T, intensity,
          'Strength endurance', team_how='Same clock for both partners; how to share each part is shown on the part.')
    items = [(p, for_sec(p, every * 60 * 0.3 * L)) for p in pair]
    w.block(items, label=f'Part A ({fmt_num(A)} min)', scheme=f'Every {fmt_num(every)} min x {sets} sets, heavy but unbroken',
            rest='Rest 3 min', tf=1.0, window=every * 60, solo_pace=True,
            team_how=YGIG + 'P1 takes the odd intervals and P2 the even ones. With twice the rest, go heavier than solo.')
    met = [('run', rng.choice([400, 600])), ]
    for s in pick(ANY_ST, 2, exclude=pair) + pick(CORE, 1):
        met.append((s, for_sec(s, rng.uniform(55, 80) * L)))
    w.block(met, label=f'Part B ({B} min)', scheme=f'AMRAP {B} min', tf=1.5,
            team_how=YGIG + 'P1 does a full round, then P2. Bigger rounds because you rest while your partner works.')
    w.d['scoring'] = 'Part A load used; Part B rounds + reps'
    return w


def t_compromised(L, intensity):
    opts = [(6, 7), (7, 6), (8, 5), (8, 6), (9, 5), (5, 9), (6, 8), (12, 4), (10, 4)]
    n, r = rng.choice(opts)
    T = n * r
    run = {5: 400, 6: 600, 7: 800, 8: 1000, 9: 1000, 10: 1000, 12: 1600}[n]
    a, b = pick(RACE_ST + ['burpee_box', 'row_cal', 'ski_cal'], 2)
    rem = n * 60 * rng.uniform(0.72, 0.8) - est('run', run) - TRANSITION
    w = W('Intervals', f'Every {n} min x {r} rounds', T, intensity, 'Compromised running', tf=1.4)
    w.block([('run', run, False, '@ race pace'),
             ['odd rounds: ', (a, for_sec(a, rem * L))],
             ['even rounds: ', (b, for_sec(b, rem * L))]],
            scheme=f'{r} rounds, start a new round every {n} min', window=n * 60, per_item=True, lead=1)
    w.d['scoring'] = 'Slowest round; rest is whatever is left of the interval'
    return w


def t_max_distance(L, intensity):
    opts = [(3, 1, 11), (4, 1, 9), (2, 1, 15), (5, 1, 8), (3, 2, 9), (4, 2, 7)]
    on, off, s = rng.choice(opts)
    T = s * on + (s - 1) * off
    k = rng.choice([3, 4, 5])
    mvs = ['run'] + pick(['row', 'ski', 'bike', 'sled_pull', 'sled_push', 'bbj_m', 'farmers', 'sb_lunge'], k - 1)
    w = W('Max distance', f'{s} sets for max distance: {on} min on / {off} min off', T, intensity, 'Compromised running',
          team_how=YGIG + 'one partner works while the other rests, switch every 30 s, so you can go harder. '
                          'On the run, both go together. Score the team total.')
    lines = []
    for i, m in enumerate(mvs):
        lines.append(f"{on} min max {MV[m]['name']}" + (f" ({MV[m]['w']})" if MV[m].get('w') else ''))
        w.d['movements'].add(MV[m]['name'])
    w.block(lines, scheme=f'Cycle through the list in order until all {s} sets are done; rest {off} min between sets')
    w.d['scoring'] = 'Total metres'
    return w


class Retry(Exception):
    pass


def fit_for_time(build, lo=0.80, hi=0.92, fmin=0.7, fmax=1.3):
    """build(f) -> (items_struct, est_sec). Pick cap in 40-48 and scale f to fit.
    f is kept close to 1 so volumes stay realistic; if that cannot fit, retry."""
    cap = rng.choice([40, 42, 44, 45, 46, 48])
    f = 1.0
    for _ in range(40):
        res, e = build(f)
        ratio = e / (cap * 60)
        if lo <= ratio <= hi:
            return res, cap, e
        f = min(fmax, max(fmin, f * ((lo + hi) / 2) / ratio))
    res, e = build(f)
    cap = math.ceil(e / 60 / ((lo + hi) / 2))
    if not 40 <= cap <= 48:
        raise Retry
    return res, cap, e


def seq_est(items):
    t = 0
    for it in items:
        if isinstance(it, tuple) and it[1] is not None:
            t += est(it[0], it[1]) + TRANSITION
    return t


def t_run_ladder(L, intensity):
    ladders = [[400, 600, 800, 1000, 800, 600, 400], [1200, 1000, 800, 600, 400],
               [400, 600, 800, 1000, 1200], [800, 800, 800, 800, 800, 800], [400, 800, 1200, 800, 400],
               [1000, 1000, 1000, 1000, 1000]]
    runs = rng.choice(ladders)
    ns = len(runs) - 1
    half = pick(['burpee', 'wall_ball', 'sb_lunge', 'bbj', 'kb_swing', 'farmers', 'sled_push', 'row_cal', 'ski_cal'], (ns + 1) // 2)
    sts = (half + half[::-1][ns % 2:])[:ns] if runs == runs[::-1] else pick(['burpee', 'wall_ball', 'sb_lunge', 'bbj', 'kb_swing', 'farmers', 'sled_push', 'row_cal', 'ski_cal', 'sled_pull'], ns)
    base = {s: (40 * 60 - sum(runs) * 0.3 - 2 * len(runs) * TRANSITION) / ns * rng.uniform(0.85, 1.1) for s in sts}
    if max(base.values()) > 260:
        raise Retry

    def build(f):
        items = []
        for i, r in enumerate(runs):
            items.append(('run', r))
            if i < ns:
                s = sts[i]
                items.append((s, for_sec(s, base[s] * f * L)))
        return items, seq_est(items)
    items, cap, e = fit_for_time(build)
    w = W('For time', f'For time, time cap {cap} min', cap, intensity, 'Compromised running', tf=1.3)
    w.block(items)
    w.d['scoring'] = 'Time (or work done at the cap)'
    return w


# ---- team of 2 (native team; solo version scales the work down)
def team_block_styles(L, Lmin):
    style = rng.randrange(4)
    if style == 0:
        st = pick(BURPEES + ['wall_ball', 'kb_swing', 'box_step'], 2)
        return [('run', 400, False, 'T:=> P1'),
                [(st[0], for_sec(st[0], 50 * L)), ' + ', (st[1], for_sec(st[1], 50 * L)), 'T: => P2'],
                'T:switch when both finish']
    if style == 1:
        e = rng.choice(ERG_M)
        return [(e, rnd_qty(e, 500 if e != 'bike' else 1000)),
                (b := pick(BURPEES)[0], for_sec(b, 60 * L)),
                ('wb_pp', for_sec('wb_pp', 75 * L)),
                'T:one partner works at a time, split as you wish']
    if style == 2:
        a, b = rng.sample(['sled_push', 'sled_pull', 'lunge', 'farmers', 'sb_lunge'], 2)
        return [(a, rnd_qty(a, 50 if MV[a]['sec'] > 1 else 200), False, 'T:=> split as you wish'),
                (b, rnd_qty(b, 50 if MV[b]['sec'] > 1 else 200), False, 'T:=> you go, I go')]
    e = rng.choice(ERG_M)
    s = rng.choice(['sled_push', 'sled_pull'])
    return [(e, 1000 if e == 'bike' else 500),
            (s, 50, False, 'T:=> 12.5 m sections, alternate')]


def t_team_amrap(L, intensity):
    b, Lm = rng.choice([(3, 12), (3, 13), (3, 14), (4, 9), (4, 8)])
    T = b * Lm + (b - 1) * 3
    w = W('AMRAP blocks', f'{b} x AMRAP {Lm} min', T, intensity, 'Team of 2', native='team', sf=0.6,
          team_how='Partner rules are shown on each line (=> P1 / P2, split as you wish, you go, I go).')
    for i in range(b):
        w.block(team_block_styles(L, Lm), label=f'AMRAP {Lm} min',
                rest='rest 3 min' if i < b - 1 else None)
    w.d['scoring'] = 'Rounds + reps per block'
    return w


def t_team_synchro(L, intensity):
    k = rng.choice([6, 7, 8])
    pool = [('ski', 1000), ('row', 1000), ('sled_push', 50), ('sled_pull', 50), ('bbj_m', 80),
            ('sb_lunge', 100), ('farmers', 200), ('wall_ball', 100), ('kb_swing', 80), ('farmer_lunge', 100)]
    sts = rng.sample(pool, k)
    run = rng.choice([400, 400, 600])

    def build(f):
        items = []
        for s, q in sts:
            items.append(('run', run, False, 'T:synchro (run together)'))
            items.append((s, rnd_qty(s, q * f * L)))
        items.append(('run', run, False, 'T:synchro'))
        # one partner works at a time on each station, a little faster than solo
        e = sum(est('run', run) + TRANSITION for _ in range(k + 1)) + sum(est(s, q) * 0.85 + TRANSITION for s, q in
                                                                          [(i[0], i[1]) for i in items if i[0] != 'run'])
        return items, e
    items, cap, e = fit_for_time(build)
    w = W('Synchro chipper', f'For time, time cap {cap} min', cap, intensity, 'Team of 2', native='team', sf=0.8,
          team_how='Run every leg together. Split each station as you wish; the order of stations does not matter.')
    w.block(items)
    w.d['scoring'] = 'Time'
    return w


def t_team_relay(L, intensity):
    run = rng.choice([500, 600])
    sts = rng.sample(['ski', 'sled_push', 'sled_pull', 'bbj_m', 'row', 'farmers', 'sb_lunge', 'wall_ball'], 8)
    sts.sort(key=['ski', 'sled_push', 'sled_pull', 'bbj_m', 'row', 'farmers', 'sb_lunge', 'wall_ball'].index)
    quarter = {'ski': 500, 'sled_push': 25, 'sled_pull': 25, 'bbj_m': 40, 'row': 500, 'farmers': 100, 'sb_lunge': 50, 'wall_ball': 50}

    def build(f):
        items = []
        for s in sts:
            items.append(('run', run))
            items.append((s, rnd_qty(s, quarter[s] * f * L)))
        e = seq_est(items)
        return items, e
    items, cap, e = fit_for_time(build, 0.82, 0.93)
    w = W('Race relay', f'Race relay, time cap {cap} min', cap, intensity, 'Team of 2', native='team', sf=0.85,
          team_how='Partners alternate legs: P1 does leg 1 (run + station), P2 does leg 2, and so on.',
          solo_how='Do all 8 legs yourself at a steady race effort.')
    w.block(items)
    w.d['scoring'] = 'Time'
    return w


def t_team_runner(L, intensity):
    work = [('row', 2000), ('wall_ball', 150), ('sled_push', 100), ('bbj_m', 80), ('farmers', 400),
            ('sb_lunge', 100), ('ski', 2000), ('kb_swing', 100), ('burpee_box', 60), ('sled_pull', 100)]
    sts = rng.sample(work, 7)

    def build(f):
        items = [(s, rnd_qty(s, q * f * L)) for s, q in sts]
        return items, seq_est(items) / 0.92
    items, cap, e = fit_for_time(build)
    w = W('Runner chipper', f'For time, time cap {cap} min', cap, intensity, 'Team of 2', native='team', sf=0.5,
          team_how='While one partner runs 400 m, the other works down the list. Swap each time the runner returns.',
          solo_how='Run 400 m after each station.')
    w.block(items)
    w.d['movements'].add('run')
    w.d['scoring'] = 'Time'
    w.extra_est = lambda sc: (0, len(sts) * (est('run', 400) + TRANSITION) if sc != 1.0 else 0)
    return w


# ---- engine
def t_max_reps_sets(L, intensity):
    s, on, off = rng.choice([(4, 10, 2), (5, 7, 2), (5, 8, 1), (6, 6, 2), (3, 13, 2), (4, 9, 2)])
    T = s * on + (s - 1) * off
    lead = rng.choice([('run', 800), ('run', 600), ('row', 500), ('ski', 500), ('bike', 2000)])
    if lead[0] == 'run' and rng.random() < 0.5:
        lead_txt = f"{text('run', lead[1])} / {text('bike', 2000 if lead[1] == 800 else 1500)}"
    else:
        lead_txt = text(*lead)
    w = W('Max reps', f'{s} sets for max reps: {on} min on / {off} min off', T, intensity, 'Engine', tf=1.6,
          team_how='Do the opening run or erg together. Split the middle movement as you wish. '
                   'On the max movement, you go, I go every 5 reps. Score the team total.')
    w.d['movements'].add(MV[lead[0]]['name'])
    max_mv = pick(BURPEES + ['wall_ball'])[0]
    middles = pick(STRENGTH + CORE, s, exclude=(max_mv,))
    second = None
    if on >= 9:
        second = rng.choice([e for e in ['row', 'ski', 'bike'] if e != lead[0]])
        second = (second, 1000 if second == 'bike' else 500)
    fixed = est(*lead) + (est(*second) if second else 0)
    budget = min(120, on * 60 * 0.6 - fixed - 2 * TRANSITION)
    if budget < 40:
        raise Retry
    for i in range(s):
        m = middles[i]
        q = for_sec(m, budget * L)
        w.block([lead_txt, (m, q)] + ([text(*second)] if second else []) + [mx(max_mv) + ('in the time left',)],
                label=f'Set {i+1}')
    w.d['scoring'] = f"Total {MV[max_mv]['name']}"
    return w


def t_machine_rotation(L, intensity):
    every = rng.choice([4, 4, 5, 3])
    T = {3: 45, 4: rng.choice([40, 44, 48]), 5: 45}[every]
    machines = rng.sample(['bike_cal', 'row_cal', 'ski_cal'], 3)
    st = pick(BURPEES + ['wall_ball', 'kb_swing', 'db_thruster'], 1)[0]
    w = W('Every X min', f'Every {every} min for {T} min ({T // every} rounds)', T, intensity, 'Engine', tf=2.0,
          team_how=YGIG + f'P1 takes the machine while P2 does the station reps, then swap roles each round. '
                          f'The station reps are doubled because you get the whole interval for them.')
    q = for_sec(st, rng.uniform(35, 45) * L)
    w.block([f"min 1-{every-1}: max cal, rotate {' > '.join(MV[m]['name'] for m in machines)}",
             [f"min {every}: ", (st, q)],
             '@ max sustainable pace for all'], window=dict(solo=60, team=every * 60), per_item=True)
    w.d['movements'].update([MV[m]['name'] for m in machines])
    w.d['scoring'] = 'Total calories'
    return w


def t_descending(L, intensity):
    schemes = [[40, 25, 15], [30, 20, 10], [50, 35, 20], [21, 15, 9], [27, 21, 15, 9], [20, 16, 12, 8]]
    rng.shuffle(schemes)
    run = rng.choice([800, 600, 400])
    erg = rng.choice(ERG_CAL)
    mvs = pick(['wall_ball', 'goblet_lunge', 'db_pp', 'kb_swing', 'db_thruster', 'burpee', 'box_step', 'db_snatch'], rng.choice([2, 3]))

    best = None
    for sch in schemes:
        e = 0
        for r in sch:
            e += est(erg, r) + sum(est(m, r) for m in mvs) + est('run', run) + (len(mvs) + 2) * TRANSITION
        for cap in (40, 42, 44, 45, 46, 48):
            ratio = e / (cap * 60)
            if 0.78 <= ratio <= 0.93:
                best = (sch, cap)
                break
        if best:
            break
    if not best:
        raise Retry
    sch, cap = best

    def reps(scale):
        return '-'.join(str(int(round(r * scale))) for r in sch)
    w = W('For time', lambda sc: f"{reps(sc)} for time, time cap {cap} min", cap, intensity, 'Engine', tf=1.3)
    w.block([f"cal {MV[erg]['name']}"] + [f"{MV[m]['name']}" + (f" ({MV[m]['w']})" if MV[m].get('w') else '') for m in mvs]
            + [f"{text('run', run)} after each round"], scheme=lambda sc: f"{reps(sc)} reps")
    w.d['movements'].update([MV[erg]['name'], 'run'] + [MV[m]['name'] for m in mvs])
    w.d['scoring'] = 'Time'
    w.extra_est = lambda sc: (sum(est(erg, r * sc) + sum(est(m, r * sc) for m in mvs) for r in sch),
                              len(sch) * (est('run', run) + (len(mvs) + 2) * TRANSITION))
    return w


# ---- for time / simulation
HALF_FRONT = [('ski', 1000), ('sled_push', 50), ('sled_pull', 50), ('bbj_m', 80)]
HALF_BACK = [('row', 1000), ('farmers', 200), ('sb_lunge', 100), ('wall_ball', 100)]


def t_half_sim(L, intensity, which=None, benchmark=False):
    which = which or rng.choice(['front', 'back', 'odd', 'even', 'all-half'])
    if which == 'front':
        sts, run, name = HALF_FRONT, 1000, 'Race front half'
    elif which == 'back':
        sts, run, name = HALF_BACK, 1000, 'Race back half'
    elif which == 'odd':
        sts, run, name = [HALF_FRONT[0], HALF_FRONT[2], HALF_BACK[0], HALF_BACK[2]], 1000, 'Race odd stations'
    elif which == 'even':
        sts, run, name = [HALF_FRONT[1], HALF_FRONT[3], HALF_BACK[1], HALF_BACK[3]], 1000, 'Race even stations'
    else:
        sts = [(s, q / 2) for s, q in HALF_FRONT + HALF_BACK]
        run, name = 500, 'All 8 race stations at half volume'
    items = []
    for s, q in sts:
        items.append(('run', run))
        items.append((s, rnd_qty(s, q)))
    e = seq_est(items)
    cap = min(48, max(40, math.ceil(e / 60 / 0.85)))
    if benchmark:
        tf, how = 1.0, 'Doubles race rules: run every km together, split each station as you wish.'
    else:
        tf, how = 1.3, 'Doubles style with 30% more station work: ' + TEAM_SPLIT
    w = W('Simulation', f'{name}, for time, time cap {cap} min', cap, intensity, 'Race simulation', tf=tf, team_how=how)
    w.block(items, scheme='race weights, race order')
    w.d['scoring'] = 'Time; note each run split'
    return w


def t_chipper_then(L, intensity):
    erg1, erg2 = rng.choice(ERG_CAL), rng.choice(ERG_CAL)
    m1 = rng.choice(['wall_ball', 'kb_swing', 'db_thruster', 'goblet_lunge'])
    m2 = rng.choice(['burpee_tgt', 'bbj', 'burpee_row', 'burpee_box', 'burpee_db'])
    mid = rng.choice([('row', 2000), ('run', 1600), ('ski', 2000), ('run', 2000)])
    desc = rng.choice([[50, 35, 20], [40, 30, 20], [30, 25, 20]])

    def build(f):
        c1 = rnd_qty(erg1, 26 * f * L)
        c2 = rnd_qty(erg2, 18 * f * L)
        b = rnd_qty(m2, 16 * f * L)
        d = [rnd_qty(m1, x * f * L) for x in desc]
        e = 3 * est(erg1, c1) + sum(est(m1, x) for x in d) + est(*mid) + 3 * (est(erg2, c2) + est(m2, b)) + 14 * TRANSITION
        return (c1, c2, b, d), e
    (c1, c2, b, d), cap, e = fit_for_time(build)
    w = W('For time', f'For time, time cap {cap} min', cap, intensity, 'Race simulation', tf=1.3)
    wt = f" ({MV[m1]['w']})" if MV[m1].get('w') else ''
    w.block([(erg1, c1), lambda sc: f"{'-'.join(str(rnd_qty(m1, x * sc)) for x in d)} {MV[m1]['name']}{wt}"],
            label='3 rounds of', reps=3)
    w.block([mid], label='then', tf=1.0)
    w.block([(erg2, c2), (m2, b)], label='then 3 rounds of', reps=3)
    w.d['movements'].add(MV[m1]['name'])
    w.d['scoring'] = 'Time'
    w.extra_est = lambda sc: (sum(est(m1, rnd_qty(m1, x * sc)) for x in d), 0)
    return w


def t_rounds_rest(L, intensity):
    erg = rng.choice(ERG_CAL)
    st = rng.choice(['wall_ball', 'kb_swing', 'burpee', 'bbj', 'db_thruster', 'goblet_lunge', 'box_step'])
    run = rng.choice([400, 400, 600])
    c = rnd_qty(erg, rng.choice([15, 20]) * L)
    q = for_sec(st, 45 * L)
    per = est(erg, c) + est('run', run) + est(st, q) + 3 * TRANSITION
    rounds = max(5, min(12, int((44 * 60 * 0.9 + 60) // (per + 60))))
    T = math.ceil((rounds * (per + 60) - 60) / 60 / 0.9)
    T = min(48, max(40, T))
    w = W('Rounds for time', f'{rounds} rounds for time, time cap {T} min', T, intensity, 'Race simulation', tf=1.4)
    w.block([(erg, c), ('run', run), (st, q)], scheme=f'{rounds} rounds', rest='rest 1 min between rounds', reps=rounds)
    w.d['scoring'] = 'Time'
    w.extra_est = lambda sc: (0, (rounds - 1) * 60)
    return w


# ---- light Saturday
EASY_TEAM = 'Do it side by side at a pace where you can both talk the whole time.'


def t_zone2_mixed(L, intensity):
    mods = rng.sample(['run', 'row', 'SkiErg', 'BikeErg'], rng.choice([2, 3]))
    n = len(mods)
    per = {2: rng.choice([(4, 5), (3, 7), (6, 4)]), 3: rng.choice([(3, 5), (2, 7), (4, 4)])}[n]
    rounds, mins = per
    T = rounds * n * mins
    if T < 40: rounds += 1; T = rounds * n * mins
    if T > 48: rounds -= 1; T = rounds * n * mins
    w = W('Zone 2', f'{T} min steady, {rounds} rounds', T, 'easy', 'Light aerobic', team_how=EASY_TEAM)
    w.block([f'{mins} min {m}' for m in mods] + ['continuous, conversational pace (zone 2)'])
    w.d['movements'].update(mods)
    w.d['scoring'] = 'Total distance at an easy effort'
    return w


def t_easy_run_tech(L, intensity):
    run = rng.choice([25, 28, 30, 32])
    emom = rng.choice([12, 14, 16])
    T = run + emom
    if T < 40: emom += 40 - T; T = 40
    if T > 48: emom -= T - 48; T = 48
    emom -= emom % 2
    T = run + emom
    if T < 40: run += 40 - T; T = run + emom
    sts = pick(['wall_ball', 'sled_push', 'bbj', 'sb_lunge', 'farmers', 'sled_pull', 'ski_cal'], 2)
    w = W('Easy + technique', f'{run} min easy run + EMOM {emom} technique', T, 'easy', 'Light aerobic', tf=1.0,
          team_how=EASY_TEAM)
    w.block([f'{run} min easy run (zone 2)'], label='Part A')
    w.block([['odd: ', (sts[0], for_sec(sts[0], 20))], ['even: ', (sts[1], for_sec(sts[1], 20))],
             'light load, perfect race technique'], label='Part B', scheme=f'EMOM {emom}', window=60, per_item=True,
            team_how='P1 starts on the odd station and P2 on the even one; swap every minute and coach each other.')
    w.d['movements'].update(['run'])
    w.d['scoring'] = 'None, quality only'
    return w


def t_steady_intervals(L, intensity):
    on, r, n = rng.choice([(6, 1, 6), (8, 2, 5), (10, 2, 4), (5, 1, 7), (7, 1, 6)])
    T = n * on + (n - 1) * r
    mods = rng.sample(['run', 'row', 'SkiErg', 'BikeErg'], 2)
    w = W('Steady intervals', f'{n} x {on} min steady / {r} min easy', T, 'easy', 'Light aerobic',
          team_how='Work at the same time: one partner on each machine, swap every interval.')
    w.block([f'alternate {mods[0]} and {mods[1]} each interval', 'steady pace: able to speak in short sentences',
             f'{r} min very easy between'])
    w.d['movements'].update(mods)
    w.d['scoring'] = 'Average pace'
    return w


# ---- Sunday recovery
MOBILITY = ['90/90 hip switches', "world's greatest stretch", 'couch stretch', 'calf raises off a step (slow)',
            'tibialis raises', 'thoracic rotations', 'deep squat hold', 'pigeon stretch', 'banded shoulder dislocates',
            'dead bug', 'side plank', 'glute bridge', 'Copenhagen plank (short lever)', 'hamstring floss',
            'ankle dorsiflexion rocks', 'cat-cow', 'bird dog', 'single-leg RDL (bodyweight)']


def t_recovery(L, intensity):
    cardio = rng.choice([25, 28, 30, 32])
    mob = rng.choice([12, 15, 16])
    T = max(40, min(48, cardio + mob))
    mob = T - cardio
    mode = rng.choice(['bike', 'row', 'walk or very easy jog', 'SkiErg + bike (switch every 5 min)', 'swim or bike'])
    moves = rng.sample(MOBILITY, 5)
    w = W('Recovery', f'Active recovery: {cardio} min easy + {mob} min mobility', T, 'recovery', 'Active recovery (optional)',
          team_how='Do it together: easy chat pace for part A, then take turns holding each stretch while your partner keeps time.')
    w.block([f'{cardio} min easy {mode} (zone 1-2, nose breathing)'], label='Part A')
    w.block([f'{m}: 45 s' for m in moves] + ['one-sided moves: 45 s per side'], label='Part B',
            scheme=f'{max(2, round(mob * 60 / (len(moves) * 60 + 30)))}-3 slow rounds, {mob} min')
    w.d['movements'].update(['mobility'])
    w.d['scoring'] = 'None'
    return w


# ---------------------------------------------------------------- week plan
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
THEMES = {
    0: [t_enmom, t_emom_cycle, t_strength_metcon],
    1: [t_compromised, t_max_distance, t_run_ladder],
    2: [t_team_amrap, t_team_synchro, t_team_relay, t_team_runner],
    3: [t_max_reps_sets, t_machine_rotation, t_descending],
    4: [t_half_sim, t_chipper_then, t_rounds_rest, t_run_ladder],
    5: [t_zone2_mixed, t_easy_run_tech, t_steady_intervals],
    6: [t_recovery],
}
CYCLE = {1: 0.92, 2: 1.0, 3: 1.08, 0: 0.8}  # week % 4

ADJ = ['Iron', 'Red Line', 'Ottawa', 'Rideau', 'Glacier', 'Northern', 'Granite', 'Thunder', 'Steel', 'Maple',
       'Lumber', 'Frostbite', 'Canal', 'Midnight', 'Blackout', 'Engine', 'Sled', 'Burner', 'Long', 'Final',
       'Heavy', 'Quick', 'Double', 'Hollow', 'Prairie', 'Wild', 'Silent', 'Wolf', 'Copper', 'Storm']
NOUN = ['Grind', 'Ladder', 'Express', 'Storm', 'Circuit', 'Chase', 'Gauntlet', 'Push', 'Pull', 'Shift', 'Haul',
        'Mile', 'Furnace', 'Crossing', 'Breaker', 'Climb', 'Drift', 'Rush', 'Signal', 'Bridge', 'Vault', 'Line',
        'Wave', 'Engine', 'Run', 'Loop', 'Rally', 'March', 'Ridge', 'Current']
name_pool = [f'{a} {n}' for a in ADJ for n in NOUN if a != n]
rng.shuffle(name_pool)


def render(v):
    out = [v['headline']]
    if v.get('howTo'): out.append(v['howTo'])
    if v.get('scheme'): out.append(v['scheme'])
    for b in v['blocks']:
        out.append('')
        if b.get('label'): out.append(b['label'] + (f" ({b['scheme']})" if b.get('scheme') else '') + ':')
        elif b.get('scheme'): out.append(b['scheme'] + ':')
        if b.get('teamNote'): out.append(b['teamNote'])
        out += ['- ' + i for i in b['items']]
        if b.get('rest'): out.append(b['rest'])
    return '\n'.join(out).strip()


def build_variants(w):
    """Render solo + team. For capped workouts, shrink the non-native version until it fits the cap."""
    capped = 'time cap' in (w.headline(1.0) if callable(w.headline) else w.headline)
    cap = w.d['durationMin'] * 60
    for _ in range(8):
        solo, es = w.variant('solo')
        team, et = w.variant('team')
        if not capped:
            break
        other_est = et if w.native == 'solo' else es
        if other_est <= 0.97 * cap:
            break
        if w.native == 'solo':
            if w.tf <= 1.0: break
            w.tf = round(w.tf - 0.1, 2)
            for b in w.blocks:
                if b['tf'] and b['tf'] > 1.0: b['tf'] = round(b['tf'] - 0.1, 2)
        else:
            if w.sf <= 0.3: break
            w.sf = round(w.sf - 0.1, 2)
    return solo, team, (es / cap if capped else None), (et / cap if capped else None)


workouts, seen = [], set()
benchmarks = {}
fit_report = []
for day in range(1, 366):
    wi = (day - 1) // 7 + 1
    dow = (day - 1) % 7
    L = CYCLE[wi % 4]
    deload = wi % 4 == 0
    intensity = 'hard' if dow in (1, 4) else ('moderate' if dow in (0, 2, 3) else None)
    if deload and intensity == 'hard' and dow == 1:
        intensity = 'moderate'
    tpls = THEMES[dow]
    benchmark = None
    for attempt in range(200):
        if dow == 4 and deload:
            which = ['front', 'back'][(wi // 4 - 1) % 2]
            w = t_half_sim(1.0, 'hard', which, benchmark=True)
            benchmark = f'Benchmark {which.upper()}'
        else:
            t = tpls[(wi + attempt) % len(tpls)] if attempt < len(tpls) else rng.choice(tpls)
            try:
                w = t(L, intensity)
            except Retry:
                continue
        d = w.d
        solo, team, rs, rt = build_variants(w)
        key = hashlib.md5((solo['text'] + team['text']).encode()).hexdigest()
        if benchmark or (key not in seen and 40 <= d['durationMin'] <= 48):
            break
    assert 40 <= d['durationMin'] <= 48, (day, d)
    seen.add(key)
    if rs is not None:
        fit_report.append((day, d['format'], w.native, round(rs, 2), round(rt, 2)))
    if benchmark:
        title = benchmarks.setdefault(benchmark, 'Benchmark: ' + ('Front Half' if 'FRONT' in benchmark else 'Back Half'))
    else:
        title = name_pool.pop()
    workouts.append(dict(
        day=day, week=wi, weekday=DAYS[dow], title=title, theme=d['theme'],
        format=d['format'], durationMin=d['durationMin'], intensity=d['intensity'],
        deloadWeek=deload, benchmark=bool(benchmark), defaultMode=w.native,
        movements=sorted(d['movements']), solo=solo, team=team,
    ))

json.dump(fit_report, open('fit_report.json', 'w'))

meta = dict(
    version=2, count=len(workouts), durationRangeMin=[40, 48],
    note='Durations are the main workout only. Add a 10 min warm-up and 5 min cool-down.',
    notation={
        'M/W': 'Numbers written a/b are men/women (e.g. 20/15 cal, 6/4 kg).',
        'race weights (Men/Women Open)': 'Sled push 152/102 kg, sled pull 103/78 kg (sled included), farmers 2x24/2x16 kg, sandbag 20/10 kg, wall ball 6/4 kg.',
        'P1/P2': 'Partner 1 / partner 2 in the team version.',
        'Solo / Team': 'Every workout has a solo and a team-of-2 version. The team version adds work and says how to share it: split as you wish (one partner works at a time), you go / I go (alternate turns), or synchro (together). defaultMode is the version the workout was written for.',
        'EnMOM': 'Every n minutes on the minute: start the work at the top of each interval, rest for what is left. '
                 'The work is sized to leave about a fifth of each interval to rest; if you have under 10 s left, cut the reps or metres.',
        'AMRAP': 'As many rounds and reps as possible in the time.',
    },
    weeklyRotation=dict(zip(DAYS, [
        'Strength endurance (moderate)', 'Run + station intervals (hard)', 'Partner day: written for teams of 2 (moderate), solo version included',
        'Engine: ergs, burpees, wall balls (moderate)', 'For time / race simulation (hard)', 'Light aerobic (easy)',
        'Active recovery (optional)'])),
    cycle='4-week waves: week 1 base, week 2 +8%, week 3 +16%, week 4 lighter (-20%) with a Friday benchmark that alternates Race front half and back half so scores can be compared.',
    substitutions={
        'no sled': 'Heavy DB/KB bear crawl push or prowler on turf; pull = heavy rope pull or 2x heavy KB walking backwards.',
        'no SkiErg': 'Row same metres, or 2x the calories on the assault bike.',
        'no BikeErg': 'Assault/echo bike: 1000 m BikeErg ~ 15/12 cal.',
        'no running track': 'Treadmill at 1% incline.',
        'masters 45+': 'Cap hard days at two per week (Tue + Fri). Do Mon/Wed/Thu at a steady 7/10.',
    },
    selection='index = (days since startDate) mod 365, day 1 = startDate (a Monday). Default startDate 2026-11-02.',
)
for miss in FIT_MISSES:
    print('interval still too full (headline, mode, window s, work s):', miss)
if FIT_MISSES:
    sys.exit('not written: some intervals leave too little rest')
out = dict(meta=meta, workouts=workouts)
json.dump(out, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
print('ok', len(workouts))
