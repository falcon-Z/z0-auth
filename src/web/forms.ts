export type FormFields = Record<string, string>;

export async function parseFormBody(req: Request): Promise<FormFields> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return {};
  }

  const form = await req.formData();
  const out: FormFields = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}
