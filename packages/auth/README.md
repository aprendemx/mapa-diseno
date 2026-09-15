# auth

Password hashing and session tokens. Standard library only — no dependencies,
not even a hashing package.

```bash
npm test
```

## Why scrypt and not Argon2id

Argon2id is OWASP's first recommendation and would be the other defensible
choice. It is not used here because every Argon2 binding for Node is a native
module, and this system is maintained by one person who should never have to
debug a failed rebuild after a Node upgrade, alone, a year from now.

scrypt is also memory-hard, is on OWASP's list of acceptable alternatives, and
ships inside Node. It runs at the parameters OWASP names first: N=2^17, r=8,
p=1 — roughly 390 ms and 134 MB per hash. For three people signing in a few
times a day that cost is invisible, and for an offline attacker it is the
whole point.

Hashes are self-describing (`scrypt$N$r$p$salt$hash`), so raising the
parameters later keeps verifying every existing password instead of locking
everyone out. There is a test for exactly that.

## Two details that are easy to get wrong

**`burnVerificationTime`.** Call it when the email does not exist. Without it a
failed login returns in a millisecond for unknown users and 390 ms for known
ones, which is a working API for discovering who has an account. Measured on
the running server, the two paths now differ by about 3 ms.

**Sessions are stored as hashes.** The database keeps `sha256(token)`, never
the token. Someone who reads the sessions table gets nothing they can present
as a cookie — the same reason passwords are not stored either. A plain SHA-256
is right here, and only here: the token is 256 bits of randomness, so there is
no low-entropy secret to slow an attacker down over.
