// Workout lines split for the session cards: the movement on the left, its load or pace on the right.
// wodLine reads the Workout of the Day library, planLine the plan's sentences. Text only, no HTML.

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A capital on the movement, after any leading quantity: "600 m run" -> "600 m Run". */
function capMove(s) {
  const qty = /^[\d./-]+\s?(?:(?:m|km|min|s|sec|cal)\s+)?/.exec(s)?.[0] || '';
  return qty + cap(s.slice(qty.length));
}

// A load in brackets: (152/102 kg), (2x22.5/15 kg), (2x24/2x16 kg), (24/20 in).
const LOAD = /\(((?:2x)?\d[\d.]*(?:\/(?:2x)?\d[\d.]*)?) (kg|lb|in)\)/;

/** "2x22.5/15", "kg" -> "2×22.5 / 2×15 kg". A dumbbell pair is a pair for both the men's and the women's weight. */
function loadText(weights, unit) {
  const [a, b] = weights.split('/');
  const each = a.startsWith('2x') ? '2×' : '';
  const one = (x) => each + x.replace(/^2x/, '');
  return `${b ? `${one(a)} / ${one(b)}` : one(a)} ${unit}`;
}

/**
 * One line of a workout. "25 m sled push (335/225 lb)" -> { move: '25 m Sled push', load: '335 / 225 lb' }.
 * A line with two movements keeps its weights in place, so each stays beside its own movement.
 * text: the right side is words, not a load.
 */
export function wodLine(line) {
  const [body, ...after] = line.split(' => ');
  let move = body.trim();
  let note = after.join(' => ');
  let load = '';
  let text = false;
  const weight = LOAD.exec(move);
  if (weight && !move.includes(' + ')) {
    load = loadText(weight[1], weight[2]);
    move = `${move.slice(0, weight.index)}${move.slice(weight.index + weight[0].length)}`.replace(/\s+/g, ' ').trim();
  } else if (!weight) {
    const words = /^(.*\S)\s*\(([^()]*)\)$/.exec(move);
    if (words) {
      [, move, load] = words;
      text = true;
    }
  }
  if (!load && note) {
    load = note;
    note = '';
    text = true;
  }
  return { move: capMove(move), load, note, text };
}

// What can follow " @ " in a plan line and go on the right.
const PLAN_WEIGHT = /^((?:2 x )?\d[\d.]*(?:\/\d[\d.]*)?) (kg|lb)\b/;
const PLAN_PACE = /^\d+:\d\d(?:[–-]\d+:\d\d)?\/(?:km|500 ?m)/;
const PLAN_SHARE = /^about [\d%/]+ of body weight(?: each)?/;
// "Minute 3: 12 burpees" and "Odd minutes: ..." are timing, not the name of an exercise.
const NOT_A_NAME = /^(?:minutes?|min|odd|even|rounds?|sets?|parts?)\b/i;

/**
 * One line of a plan session. "Back Squat: 3 sets of 10 reps @ 60 kg, about 75% of body weight" ->
 * { move: 'Back Squat', load: '60 kg', note: '3 sets of 10 reps, about 75% of body weight' }.
 * Anything else reads as a sentence: the first one on the line, the rest below it in a quieter note.
 */
export function planLine(line) {
  const text = line.trim();
  // "Every 4 min for 24 min (6 rounds), each round:" introduces the lines below it.
  if (text.endsWith(':')) return { move: text.slice(0, -1), load: '', note: '', text: false, lead: true };
  const named = /^([A-Z][^:.]{2,30}): (.+)$/.exec(text);
  const name = named && !NOT_A_NAME.test(named[1]) ? named[1] : '';
  let body = name ? named[2] : text;
  let load = '';
  let words = false;

  // One movement only. "10 goblet squats @ 24 kg + 10 dumbbell rows" stays whole, or the weight would lose its movement.
  const at = body.indexOf(' @ ');
  if (at > -1 && body.indexOf(' @ ', at + 3) === -1 && !body.includes(' + ')) {
    const after = body.slice(at + 3);
    const weight = PLAN_WEIGHT.exec(after);
    const other = weight ? null : PLAN_PACE.exec(after) || PLAN_SHARE.exec(after);
    if (weight) load = loadText(weight[1].replace(/^2 x /, '2x'), weight[2]);
    else if (other) {
      load = other[0];
      words = /about/.test(load);
    }
    if (load) body = body.slice(0, at) + after.slice((weight || other)[0].length);
  }
  if (name) return { move: name, load, note: body, text: words };

  const sentence = /^(.{12,}?[a-z)\d])\.\s+(?=[A-Z])(.+)$/.exec(body);
  const first = sentence ? sentence[1] : body;
  const parsed = load ? { move: capMove(first), load, text: words, note: '' } : wodLine(first);
  // Words in brackets go on the right only if they fit there: a long aside reads better under the line.
  const aside = parsed.text && parsed.load.length > 24 ? cap(parsed.load) : '';
  return {
    ...parsed,
    load: aside ? '' : parsed.load,
    text: aside ? false : parsed.text,
    note: [parsed.note, aside, sentence ? sentence[2] : ''].filter(Boolean).join('. '),
  };
}
