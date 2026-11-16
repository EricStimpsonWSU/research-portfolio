"""Counter-based noise that matches the PFC quench page bit for bit.

Philox4x32-10 (Salmon et al., Random123). Only output word 0 is used.
  key     = (seed, stream)        stream 0: initial noise, 1: reheat strokes
  counter = (cell, draw, 0, 0)    cell = y*N + x, draw = stroke index (0 for init)
  u       = (word0 >> 8) * 2**-24 exact in f32 and f64, u in [0, 1)
Initial field: psi = psibar + A*(2u - 1), with the noise's own mean removed.
Pass xp=cupy to run on the GPU; the integer path is identical.
"""
import numpy as np

_M0, _M1 = 0xD2511F53, 0xCD9E8D57
_W0, _W1 = 0x9E3779B9, 0xBB67AE85
_MASK = 0xFFFFFFFF


def philox4x32_10(c0, c1, c2, c3, k0, k1, xp=np):
    u64 = xp.uint64
    c0, c1, c2, c3 = (xp.asarray(c, dtype=u64) for c in (c0, c1, c2, c3))
    k0, k1 = k0 & _MASK, k1 & _MASK
    m0, m1, mask = u64(_M0), u64(_M1), u64(_MASK)
    for r in range(10):
        if r:
            k0, k1 = (k0 + _W0) & _MASK, (k1 + _W1) & _MASK
        p0, p1 = m0 * c0, m1 * c2          # 32x32 -> 64, no overflow
        c0, c1, c2, c3 = ((p1 >> u64(32)) ^ c1 ^ u64(k0), p1 & mask,
                          (p0 >> u64(32)) ^ c3 ^ u64(k1), p0 & mask)
    return tuple(c.astype(xp.uint32) for c in (c0, c1, c2, c3))


def uniform(seed, stream, cell, draw=0, xp=np):
    cell = xp.asarray(cell, dtype=xp.uint64)
    z = xp.zeros_like(cell)
    w = philox4x32_10(cell, z + draw, z, z, seed, stream, xp=xp)[0]
    return (w >> 8).astype(xp.float64) * 2.0**-24


def quench_field(N, psibar, A, seed, dtype=np.float64, xp=np):
    u = uniform(seed, 0, xp.arange(N * N, dtype=xp.uint64), xp=xp).reshape(N, N)
    noise = A * (2.0 * u - 1.0)
    return (psibar + noise - noise.mean()).astype(dtype)


if __name__ == "__main__":
    kat = [((0,) * 4, (0, 0), "6627e8d5 e169c58d bc57ac4c 9b00dbd8"),
           ((_MASK,) * 4, (_MASK,) * 2, "408f276d 41c83b0e a20bc7c6 6d5451fd"),
           ((0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344), (0xa4093822, 0x299f31d0),
            "d16cfe09 94fdcceb 5001e420 24126ea1")]
    for c, k, want in kat:
        got = " ".join(f"{int(x):08x}" for x in philox4x32_10(*c, *k))
        assert got == want, (got, want)
    print("Random123 known-answer tests pass")
    print(uniform(12345, 0, [0, 1, 2, 3, 65535]))
    print(uniform(12345, 1, [0, 1, 2], draw=7))
