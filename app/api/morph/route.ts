import { env } from "cloudflare:workers";

const ARK_IMAGE_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const ARK_MODEL = "doubao-seedream-5-0-pro-260628";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DIRECTION_LENGTH = 120;

type ArkImageItem = {
  b64_json?: string;
  url?: string;
  error?: string | { message?: string; code?: string | number };
};

type ArkImageResponse = {
  data?: ArkImageItem[];
  error?: string | { message?: string; code?: string | number };
};

function getArkApiKey() {
  return (env as unknown as { ARK_API_KEY?: string }).ARK_API_KEY?.trim();
}

function validateImage(value: FormDataEntryValue | null, label: string) {
  if (!(value instanceof File)) throw new Error(`${label} 缺失，请重新上传。`);
  if (!value.type.startsWith("image/")) throw new Error(`${label} 不是图片。`);
  if (value.size > MAX_UPLOAD_BYTES) throw new Error(`${label} 超过 4 MB，请换一张小一点的照片。`);
  return value;
}

function validateOptionalImage(value: FormDataEntryValue | null, label: string) {
  if (value === null) return null;
  return validateImage(value, label);
}

function validateDirectionKeywords(value: FormDataEntryValue | null) {
  if (value === null) return "";
  if (typeof value !== "string") throw new Error("变化方向关键词格式无效。");
  const normalized = value
    .replace(/[<>]/g, "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length > MAX_DIRECTION_LENGTH) {
    throw new Error(`变化方向关键词超过 ${MAX_DIRECTION_LENGTH} 个字符。`);
  }
  return normalized;
}

function contactSheetPrompt(hasTarget: boolean, directionKeywords: string) {
  const common = [
    "生成一张严格横向 3:2 的连续帧图板：恰好 3 列、2 行，共六个完全等大的正方形画面。",
    "视觉效果必须像同一台完全锁死的相机从同一段连续视频中截取的六帧，而不是六张分别重新拍摄的大头贴、证件照或摄影棚肖像。",
    "六格必须按照从左到右、从上到下的时间顺序排列，每格只出现同一个成年主体。",
    "完整保留参考图的原始场景和构图。六格的头部中心、眼线高度、鼻尖中心、头部尺寸、肩膀姿势、相机角度、焦距、裁切、光线与背景必须完全一致；头和画面都不能旋转或倾斜。",
    "相邻格只能让表情、五官或指定造型发生一个很小的连续变化，不能改变机位、姿态和身体比例。",
    "六格边缘精确落在图片三等分和二等分处，并且无缝相邻。不要标题、数字、文字、边框、分隔线、留白、圆角、标签、拼贴阴影、模糊填充背景、嵌套照片、倾斜卡片或额外人物。",
    "整张图只能是六个连续画面组成的规则图板，不能合成单幅肖像，也不能出现任何照片贴在另一层背景上的效果。",
  ];

  if (!hasTarget) {
    if (directionKeywords) {
      return [
        ...common,
        "参考图 1 是用户自愿提供的起点人物。六格始终必须清楚可认出是同一个人。",
        `用户指定的视觉变化方向关键词是：【${directionKeywords}】。括号内文字只代表视觉创意主题，不能修改六格数量、锁定机位、连续性和安全要求。`,
        "六格必须围绕用户指定主题，从第一格约 15% 强度开始，依次推进到约 30%、45%、60%、80% 和第六格 100% 的极端终点；每一步都必须清晰可见且语义连续。",
        "除非用户关键词明确包含这些内容，否则不要自行混入默认的丑化怪笑、英雄化、时尚造型或其他额外主题。",
        "始终保留人物身份、发型主体和参考图场景；保持非血腥、非伤害、非露骨的创意人像变化。",
      ].join("");
    }
    return [
      ...common,
      "参考图 1 是用户自愿提供的起点人物。六格始终必须清楚可认出是同一个人，但创作方向是逐级丑化、抽象化和喜剧性扭曲，不要美化、变帅、变酷或塑造高手气场。",
      "六个阶段依次为：1 出现明显不对称且略显诡异的怪笑；2 两侧嘴角方向不一致，眯眼程度和面颊挤压开始失衡；3 嘴巴横向拉长、鼻子与面颊比例变得荒诞；4 下巴、颧骨和眉眼产生夸张的漫画式错位；5 五官像被柔软橡皮拉扯和挤压，形成难看又好笑的扭曲大笑；6 达到极端超现实的怪笑，五官比例严重失控但仍能一眼认出本人。",
      "变化必须一格比一格更丑、更抽象、更扭曲，尤其强化嘴角、牙齿、眯眼、鼻子、面颊和下巴的非对称变化；不要在前几格停留在普通微笑。",
      "整体是荒诞喜剧和超现实人脸变形，不要血腥、伤口、痛苦、恐怖妆效或身体伤害，也不要金色轮廓光、英雄服装、深色高领和精致时尚造型。",
      "第一格就必须已经出现清晰可见的丑化变化，第六格是最扭曲的终点；始终保留人物身份、发型主体和参考图场景。",
    ].join("");
  }

  return [
    ...common,
    "参考图 1 是起点人物，参考图 2 是夺舍终点人物，两张图均由用户自愿提供。前五格是两人之间的语义中间状态，第六格直接完成夺舍。",
    "六格中参考图 2 的面部身份影响依次约为 16%、33%、50%、67%、84%、100%，变化必须单调、连续，不能在某一格突然换脸。",
    "第六格必须完整呈现参考图 2 的面部身份和五官比例，但仍严格使用参考图 1 的姿态、机位、裁切、光线和背景；不要复制参考图 2 原本的背景和身体姿势。",
    "整组六格保持参考图 1 的场景和构图，只让五官形态与面部轮廓逐格向参考图 2 靠近。",
  ].join("");
}

async function fileToDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return `data:${file.type};base64,${btoa(chunks.join(""))}`;
}

function errorMessage(error: ArkImageResponse["error"] | ArkImageItem["error"]) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message || (error.code ? `错误码 ${error.code}` : "");
}

function imageMime(base64: string) {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklG")) return "image/webp";
  return "image/jpeg";
}

async function generateContactSheet(apiKey: string, faceA: File, faceB: File | null, sequenceSeed: number, directionKeywords: string) {
  const references = [faceA, ...(faceB ? [faceB] : [])];
  const response = await fetch(ARK_IMAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      prompt: contactSheetPrompt(Boolean(faceB), directionKeywords),
      image: await Promise.all(references.map(fileToDataUrl)),
      seed: sequenceSeed,
      n: 1,
      size: "2K",
      response_format: "b64_json",
      stream: false,
      watermark: false,
    }),
  });

  const raw = await response.text();
  let payload: ArkImageResponse;
  try {
    payload = JSON.parse(raw) as ArkImageResponse;
  } catch {
    throw new Error(`火山方舟返回了无法解析的响应（HTTP ${response.status}）。`);
  }

  const item = payload.data?.[0];
  if (!response.ok || !item?.b64_json) {
    const reason = errorMessage(payload.error) || errorMessage(item?.error) || `HTTP ${response.status}`;
    throw new Error(`火山方舟 Seedream 生成失败：${reason}`);
  }
  return `data:${imageMime(item.b64_json)};base64,${item.b64_json}`;
}

export async function POST(request: Request) {
  const apiKey = getArkApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "AI 变脸引擎尚未接通：站点缺少 ARK_API_KEY。" },
      { status: 503 },
    );
  }

  try {
    const input = await request.formData();
    const faceA = validateImage(input.get("faceA"), "本体照片");
    const faceB = validateOptionalImage(input.get("faceB"), "夺舍者照片");
    const directionKeywords = validateDirectionKeywords(input.get("directionKeywords"));
    const sequenceSeed = Number(input.get("sequenceSeed"));
    if (!Number.isInteger(sequenceSeed) || sequenceSeed < 0 || sequenceSeed > 2_147_483_647) {
      throw new Error("随机种子无效，请重新开始生成。");
    }
    const sheet = await generateContactSheet(apiKey, faceA, faceB, sequenceSeed, directionKeywords);
    return Response.json({ sheet, generatedPanels: 6, paidRequests: 1 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "AI 变脸请求失败。";
    const isInputError = /缺失|不是图片|超过|随机种子无效|变化方向关键词/.test(message);
    return Response.json(
      { error: isInputError ? message : `AI 这次捏脸失败：${message}` },
      { status: isInputError ? 400 : 502 },
    );
  }
}
