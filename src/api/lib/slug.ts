const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Slugify a display name for future app/org identifiers. */
export function slugifyOrganization(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "organization";
}

/** Slugify an application display name (falls back to `app`). */
export function slugifyAppName(name: string): string {
  const slug = slugifyOrganization(name);
  return slug === "organization" ? "app" : slug;
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= 64 && SLUG_RE.test(slug);
}
