'use strict';

/**
 * ==============================================================================
 * `AU31` — A CARD NEEDS A FIGURE FROM THE CURRENT MESSAGE
 * ==============================================================================
 *
 * P8.8 turn 11, stable across three live runs, byte-identical: after "Log 35
 * patients for January" (turn 10, correctly carded), the bare "Log my workload."
 * came back with a FILLED card — 35, January — inherited from the turn before.
 * The user gave no figure; the app would have rendered a ready-to-approve card
 * for one. `AC16` means nothing writes without a click, so this is a mis-click
 * hazard in a clinical workload record rather than a silent write. It is still
 * a card the user did not ask for.
 *
 * The prompt now says the number must be in the current message. A rule in a
 * prompt is a request to a model, not a control (`AURA-GUARDRAILS.md` §B), and
 * this one was ignored three times out of three under its previous wording. So
 * the application enforces it: a card whose figure does not appear in the
 * message that produced it is discarded, and the reply becomes a question.
 *
 * What is deliberately NOT enforced: the month. "Actually make it 40, for
 * February" (turn 12) and "make it 40" both carry a figure, and the second
 * legitimately inherits the month. The rule is about the number.
 */

const NUMBER_WORDS = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
    'hundred', 'thousand', 'dozen', 'none', 'nil',
];
const NUMBER_WORD_RE = new RegExp('\\b(?:' + NUMBER_WORDS.join('|') + ')\\b', 'i');

/** Does this message carry a quantity — a digit, or a number word? */
const mentionsQuantity = (text) => {
    const t = String(text ?? '');
    return /\d/.test(t) || NUMBER_WORD_RE.test(t);
};

const EMPTY_CARD = Object.freeze({
    target_collection: null, target_doc: null, target_field: null,
    target_value: null, target_month: null,
});

/**
 * What the user reads instead of a card they did not ask for. Plain, in AURA's
 * voice, and true: nothing was prepared, and here is what would let it be.
 */
const AU31_ASK = 'I have not prepared a card, because your message did not give me a figure. '
    + 'Tell me the number, and the month if it is not the one we were discussing, and I will '
    + 'set it up for you to approve.';

/**
 * Apply the rule to a parsed AURA response. Returns `{ parsed, suppressed }`;
 * when `suppressed` is false, `parsed` is the same object, untouched.
 *
 * A card is "filled" when `target_value` is a number (or a numeric string — the
 * prompt forbids strings but this is the layer that must not trust that).
 */
const currentTurnRule = (parsed, userText) => {
    if (!parsed || typeof parsed !== 'object') return { parsed, suppressed: false };
    const card = parsed.db_workload;
    if (!card || typeof card !== 'object') return { parsed, suppressed: false };

    const v = card.target_value;
    const filled = (typeof v === 'number' && Number.isFinite(v))
        || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
    if (!filled) return { parsed, suppressed: false };
    if (mentionsQuantity(userText)) return { parsed, suppressed: false };

    return {
        parsed: {
            ...parsed,
            reply: AU31_ASK,
            action: null,
            db_workload: { ...EMPTY_CARD },
        },
        suppressed: true,
    };
};

module.exports = { NUMBER_WORDS, mentionsQuantity, currentTurnRule, AU31_ASK, EMPTY_CARD };
