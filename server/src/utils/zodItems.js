import { z } from 'zod';

/** An LLM list where one malformed entry shouldn't sink the rest: keep the entries that parse, drop the others. */
export const items = (item) => z.array(z.unknown()).default([]).transform((xs) => xs.map((x) => item.safeParse(x)).filter((r) => r.success).map((r) => r.data));
