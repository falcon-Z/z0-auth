export type FormFields = Record<string, string>;

export async function parseFormBody(req: Request): Promise<FormFields> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return {};
  }

  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > 64 * 1024) return {};
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > 64 * 1024) return {};
  const form = await new Request(req.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes,
  }).formData();
  const out: FormFields = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}
