import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the face morphing lab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>滑脸研究所 · AI 链式变脸实验<\/title>/);
  assert.match(html, /上传本体/);
  assert.match(html, /上传夺舍者（可选）/);
  assert.match(html, /GENERATE × 1/);
  assert.match(html, /SPLIT × 6/);
  assert.match(html, /43 LOCAL FRAMES/);
  assert.match(html, /等待照片/);
  assert.match(html, /先上传本体 · 夺舍者可选/);
  assert.doesNotMatch(html, /DEMO|RIFE 241|ZERO ARK COST/i);
  assert.match(html, /og:image/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("builds one contact sheet and creates aligned motion frames locally", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/morph/route.ts", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /type="range"/);
  assert.match(page, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(page, /accept="image\/\*"/);
  assert.match(page, /fetch\("\/api\/morph"/);
  assert.match(page, /morphFrames\.length === 6/);
  assert.match(page, /motionFrames\.length >= 31/);
  assert.doesNotMatch(page, /for \(let frameIndex = 0; frameIndex < 5; frameIndex \+= 1\)/);
  assert.doesNotMatch(page, /if \(!fileA \|\| !fileB/);
  assert.match(page, /fileB \? prepareFace\(fileB\) : Promise\.resolve\(null\)/);
  assert.match(page, /crypto\.getRandomValues\(seedArray\)/);
  assert.match(page, /body\.append\("sequenceSeed", String\(sequenceSeed\)\)/);
  assert.match(page, /if \(!preparedB && directionKeywords\.trim\(\)\) body\.append\("directionKeywords"/);
  assert.match(page, /maxLength=\{120\}/);
  assert.match(page, /留空默认：抽象丑化、扭曲怪笑/);
  assert.doesNotMatch(page, /body\.append\("previousFrame"/);
  assert.match(page, /splitContactSheet\(payload\.sheet\)/);
  assert.match(page, /createFaceDetector/);
  assert.match(page, /alignFaceFrames/);
  assert.doesNotMatch(page, /ctx\.rotate/);
  assert.doesNotMatch(page, /blur\(18px\)/);
  assert.match(page, /desiredFaceSize \/ anchor\.faceSize/);
  assert.match(page, /ctx\.drawImage\(image, sourceX, sourceY, cropSize, cropSize/);
  assert.match(page, /createLocalMotionFrames\(aligned\.frames\)/);
  assert.match(page, /stepsPerSegment = 7/);
  assert.match(page, /const rawSemanticFrames = \[preparedAUrl, \.\.\.panels\]/);
  assert.doesNotMatch(page, /alignedFaceB|preparedBUrl/);
  assert.match(page, /setMorphFrames\(aligned\.frames\.slice\(1, 7\)\)/);
  assert.match(page, /canvas\.width = 768/);
  assert.doesNotMatch(page, /demo-evolution|demoFrames|demoStages|isDemo/i);
  assert.match(page, /const singleStages =/);
  assert.match(page, /const customSingleStages =/);
  assert.match(page, /抽象封神/);
  assert.match(page, /directionKeywords\.trim\(\) \? customSingleStages : singleStages/);
  assert.match(route, /contactSheetPrompt/);
  assert.match(route, /validateDirectionKeywords/);
  assert.match(route, /MAX_DIRECTION_LENGTH = 120/);
  assert.match(route, /用户指定的视觉变化方向关键词/);
  assert.match(route, /不要自行混入默认的丑化怪笑/);
  assert.match(route, /同一台完全锁死的相机/);
  assert.match(route, /不能旋转或倾斜/);
  assert.match(route, /不能出现任何照片贴在另一层背景上的效果/);
  assert.match(route, /16%、33%、50%、67%、84%、100%/);
  assert.match(route, /第六格必须完整呈现参考图 2 的面部身份/);
  assert.match(route, /逐级丑化、抽象化和喜剧性扭曲/);
  assert.match(route, /五官像被柔软橡皮拉扯和挤压/);
  assert.match(route, /不要血腥、伤口、痛苦/);
  assert.doesNotMatch(route, /克制的高手气场|荒诞笑神强度|金色轮廓光和深色高领/);
  assert.match(route, /ark\.cn-beijing\.volces\.com\/api\/v3\/images\/generations/);
  assert.match(route, /doubao-seedream-5-0-pro-260628/);
  assert.match(route, /ARK_API_KEY/);
  assert.match(route, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(route, /validateOptionalImage\(input\.get\("faceB"\)/);
  assert.match(route, /seed: sequenceSeed/);
  assert.match(route, /references\.map\(fileToDataUrl\)/);
  assert.match(route, /n: 1/);
  assert.doesNotMatch(route, /sequential_image_generation/);
  assert.match(route, /response_format: "b64_json"/);
  assert.match(route, /size: "2K"/);
  assert.match(route, /return Response\.json\(\{ sheet, generatedPanels: 6, paidRequests: 1 \}\)/);
  assert.doesNotMatch(route, /CLOUDFLARE_MORPH|AIDP_MODELHUB_AK|aidp\.bytedance\.net|gpt-image/);
  assert.doesNotMatch(route, /ark-[a-z0-9-]{20,}/i);
  assert.doesNotMatch(page, /ARK_API_KEY|CLOUDFLARE_MORPH_TOKEN|AIDP_MODELHUB_AK|api-key|aidp\.bytedance\.net/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships same-origin MediaPipe face alignment assets", async () => {
  const model = await stat(new URL("../public/mediapipe/blaze_face_short_range.tflite", import.meta.url));
  const loader = await stat(new URL("../public/mediapipe/vision_wasm_internal.js", import.meta.url));
  const wasm = await stat(new URL("../public/mediapipe/vision_wasm_internal.wasm", import.meta.url));
  assert.ok(model.size > 100_000);
  assert.ok(loader.size > 100_000);
  assert.ok(wasm.size > 5_000_000);
});
