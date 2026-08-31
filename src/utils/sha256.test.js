/**
 * The FIPS 180-4 vectors, then a fuzz against Node's own implementation.
 * If `sha256Hex` disagrees with either, the legacy bridge recognises nobody —
 * which fails SAFE (a legacy member sees the holding screen, not somebody
 * else's data), but fails.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex } from './sha256.js';

describe('sha256Hex — NIST vectors', () => {
    it.each([
        ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
        ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
            '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ])('digests %j to the published value', (input, expected) => {
        expect(sha256Hex(input)).toBe(expected);
    });

    it('handles a message spanning multiple blocks', () => {
        expect(sha256Hex('a'.repeat(1000))).toBe(
            createHash('sha256').update('a'.repeat(1000)).digest('hex'),
        );
    });

    it('UTF-8 encodes, so a non-ASCII name digests identically to Node', () => {
        const s = 'zoë.müller@kkh.com.sg — 二 か';
        expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    });

    it('agrees with node:crypto across random inputs and every length 0-260', () => {
        for (let len = 0; len <= 260; len += 1) {
            const s = 'x'.repeat(len);
            expect(sha256Hex(s), `length ${len}`).toBe(
                createHash('sha256').update(s).digest('hex'),
            );
        }
        let seed = 0x2c9277b5;
        const rnd = () => {
            // xorshift, so the test is deterministic without Math.random.
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            return (seed >>> 0) / 0x100000000;
        };
        for (let i = 0; i < 50; i += 1) {
            const len = Math.floor(rnd() * 300);
            let s = '';
            for (let j = 0; j < len; j += 1) s += String.fromCharCode(32 + Math.floor(rnd() * 90));
            expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
        }
    });
});
