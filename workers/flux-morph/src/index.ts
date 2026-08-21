const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type Env = {
  AI: {
    run(model: string, input: unknown): Promise<{ image?: string }>;
  };
  MORPH_PROXY_TOKEN?: string;
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeEqual(actual: string, expected: string) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function requireImage(value: FormDataEntryValue | null, label: string) {
  if (!(value instanceof File) || !value.type.startsWith("image/")) {
    throw new Error(`${label} must be an image.`);
  }
  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error(`${label} exceeds 3 MB.`);
  }
  return value;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, model: MODEL });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/images/edit") {
      return json({ error: "Not found." }, 404);
    }

    const expectedToken = env.MORPH_PROXY_TOKEN?.trim();
    const authorization = request.headers.get("Authorization") ?? "";
    const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!expectedToken || !safeEqual(suppliedToken, expectedToken)) {
      return json({ error: "Unauthorized." }, 401);
    }

    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return json({ error: "Request exceeds 8 MB." }, 413);
    }

    try {
      const input = await request.formData();
      const prompt = String(input.get("prompt") ?? "").trim();
      if (!prompt) return json({ error: "Prompt is required." }, 400);

      const imageA = requireImage(input.get("input_image_0"), "input_image_0");
      const imageB = requireImage(input.get("input_image_1"), "input_image_1");
      const modelInput = new FormData();
      modelInput.append("prompt", prompt);
      modelInput.append("width", "1024");
      modelInput.append("height", "1024");
      modelInput.append("input_image_0", imageA, "person-a.jpg");
      modelInput.append("input_image_1", imageB, "person-b.jpg");

      const serialized = new Response(modelInput);
      const result = await env.AI.run(MODEL, {
        multipart: {
          body: serialized.body,
          contentType: serialized.headers.get("content-type"),
        },
      });
      if (!result.image) throw new Error("Workers AI returned no image.");
      return json({ image: result.image });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Image generation failed.";
      const isInputError = /must be an image|exceeds 3 MB/.test(message);
      return json({ error: isInputError ? message : `Workers AI failed: ${message}` }, isInputError ? 400 : 502);
    }
  },
};
