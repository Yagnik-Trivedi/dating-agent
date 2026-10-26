/** UX P1-8: interests display in Title Case like languages ("road trips" → "Road Trips"); stored values unchanged. */
export const titleCase = (t) => String(t ?? '').replace(/(^|[\s/-])(\p{Ll})/gu, (_, sep, c) => sep + c.toUpperCase())
