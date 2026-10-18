// xorshift32。种子 0 会把状态锁死，先映射到固定非零值，序列仍只由种子决定。
const ZERO_SEED_STATE = 0x6d2b79f5;

export function createPrng(seed) {
  let x = seed >>> 0;
  if (x === 0) x = ZERO_SEED_STATE;
  return {
    next() {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x;
    },
  };
}
