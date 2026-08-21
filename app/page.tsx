"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type FaceSlot = "a" | "b";
type MorphMode = "blend" | "wipe" | "glitch";
type GenerationState = "idle" | "generating" | "ready" | "error";
type FaceDetectorInstance = import("@mediapipe/tasks-vision").FaceDetector;

type FaceAnchor = {
  faceSize: number;
  x: number;
  y: number;
};

const modes: Array<{ id: MorphMode; label: string; code: string }> = [
  { id: "blend", label: "丝滑夺舍", code: "SOUL MIX" },
  { id: "wipe", label: "逐格扫描", code: "FRAME WIPE" },
  { id: "glitch", label: "信号发疯", code: "GLITCH" },
];

const stages = [
  { title: "原装出厂", note: "目前看起来还像本人，珍惜这最后的体面。" },
  { title: "轻微串脸", note: "AI 已经借走一点眉毛和下巴，但暂时拒不归还。" },
  { title: "脸权交接", note: "熟悉感正在下线，陌生感拿着工牌进场。" },
  { title: "五五开脸", note: "两个人都坚称这是自己，门禁系统决定辞职。" },
  { title: "全面入侵", note: "本体只剩一点理论上的存在，请继续谨慎滑动。" },
  { title: "夺舍成功", note: "熟人看了会沉默，亲妈看了会刷新页面。" },
  { title: "全新物种", note: "恭喜，另一张脸已完整接管这块屏幕。" },
];

const emptyStages = [
  { title: "等待上传", note: "先上传一张本体照片；第二张夺舍者照片完全可选。" },
];

const singleStages = [
  { title: "原装本人", note: "五官目前还守规矩，接下来会逐步放弃体面。" },
  { title: "笑容漏电", note: "两边嘴角开始各走各的，脸部协商机制宣告失效。" },
  { title: "五官打滑", note: "眼睛、鼻子和面颊正在失去原本的比例意识。" },
  { title: "表情扭结", note: "笑容被横向拉长，熟悉的人脸结构开始打结。" },
  { title: "比例失控", note: "颧骨和下巴拒绝服从人体工学，抽象感迅速上升。" },
  { title: "怪笑成精", note: "脸还认得出来，但每个五官都在进行喜剧性叛乱。" },
  { title: "抽象封神", note: "本人身份仍在，体面和正常比例已经全部离场。" },
];

const customSingleStages = [
  { title: "原装本人", note: "当前仍是原始状态，用户指定的变化方向尚未介入。" },
  { title: "方向启动", note: "自定义主题首次显现，变化保持轻微但已经可以辨认。" },
  { title: "主题渗透", note: "变化方向开始接管表情和五官，原始状态逐步后退。" },
  { title: "过半变形", note: "自定义主题推进到中段，连续性和辨识度同时保留。" },
  { title: "全面扩散", note: "变化已经覆盖大部分面部特征，只剩最后一次加速。" },
  { title: "接近极限", note: "自定义方向进入高强度状态，但仍能认出原始人物。" },
  { title: "主题拉满", note: "用户指定的变化方向达到完整强度，进度正式封顶。" },
];

const progressCopy = [
  "正在把六个阶段写进同一张生成任务…",
  "六宫格已返回，正在逐格切开…",
  "眼睛、鼻尖和头部尺寸正在本地对齐…",
  "正在本地补出 43 张过渡帧…",
];

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, size: number) {
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function prepareFace(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#d7d7d5";
    ctx.fillRect(0, 0, 768, 768);
    drawCover(ctx, image, 768);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/jpeg", .88);
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Image conversion failed"));
    reader.readAsDataURL(blob);
  });
}

async function splitContactSheet(sheet: string) {
  const image = await loadImage(sheet);
  if (image.naturalWidth < 900 || image.naturalHeight < 600) {
    throw new Error("AI 返回的六宫格分辨率太低，请再生成一次。");
  }

  const columns = 3;
  const rows = 2;
  const outputSize = 768;
  const cellWidth = image.naturalWidth / columns;
  const cellHeight = image.naturalHeight / rows;
  const cropSize = Math.min(cellWidth, cellHeight) * .985;
  const frames: string[] = [];

  for (let index = 0; index < columns * rows; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const sourceX = column * cellWidth + (cellWidth - cropSize) / 2;
    const sourceY = row * cellHeight + (cellHeight - cropSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
    frames.push(canvas.toDataURL("image/webp", .92));
  }
  return frames;
}

async function createFaceDetector() {
  const { FaceDetector } = await import("@mediapipe/tasks-vision");
  return FaceDetector.createFromOptions(
    {
      wasmLoaderPath: "/mediapipe/vision_wasm_internal.js",
      wasmBinaryPath: "/mediapipe/vision_wasm_internal.wasm",
    },
    {
      baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite" },
      runningMode: "IMAGE",
      minDetectionConfidence: .35,
      minSuppressionThreshold: .3,
    },
  );
}

function detectFaceAnchor(detector: FaceDetectorInstance, image: HTMLImageElement): FaceAnchor | null {
  const detections = detector.detect(image).detections;
  const detection = detections.reduce<(typeof detections)[number] | null>((largest, candidate) => {
    const area = (candidate.boundingBox?.width ?? 0) * (candidate.boundingBox?.height ?? 0);
    const largestArea = (largest?.boundingBox?.width ?? 0) * (largest?.boundingBox?.height ?? 0);
    return area > largestArea ? candidate : largest;
  }, null);
  const leftEye = detection?.keypoints[0];
  const rightEye = detection?.keypoints[1];
  const nose = detection?.keypoints[2];
  if (!leftEye || !rightEye) return null;
  const eyeX = (leftEye.x + rightEye.x) / 2;
  const eyeY = (leftEye.y + rightEye.y) / 2;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (!Number.isFinite(eyeDistance) || eyeDistance < .025) return null;
  const box = detection?.boundingBox;
  const boxX = box ? (box.originX + box.width / 2) / image.naturalWidth : eyeX;
  const boxY = box ? (box.originY + box.height / 2) / image.naturalHeight : eyeY + eyeDistance;
  const boxSize = box
    ? ((box.width / image.naturalWidth) + (box.height / image.naturalHeight)) / 2
    : eyeDistance * 2.5;
  return {
    faceSize: Math.max(eyeDistance * 2.4, boxSize),
    x: (eyeX + (nose?.x ?? eyeX) + boxX * 2) / 4,
    y: (eyeY + (nose?.y ?? eyeY) + boxY * 2) / 4,
  };
}

async function alignFaceFrames(sources: string[]) {
  let detector: FaceDetectorInstance | null = null;
  try {
    detector = await createFaceDetector();
    const images = await Promise.all(sources.map(loadImage));
    const anchors = images.map((image) => detectFaceAnchor(detector!, image));
    const target = anchors[0] ?? anchors.find((anchor): anchor is FaceAnchor => Boolean(anchor));
    if (!target) return { applied: false, frames: sources };
    const desiredFaceSize = Math.max(...anchors.flatMap((anchor) => anchor ? [anchor.faceSize] : []));

    const outputSize = 768;
    const frames = images.map((image, index) => {
      const anchor = anchors[index];
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");

      if (anchor) {
        const zoom = Math.max(1, Math.min(1.1, desiredFaceSize / anchor.faceSize));
        const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
        const maxSourceX = Math.max(0, image.naturalWidth - cropSize);
        const maxSourceY = Math.max(0, image.naturalHeight - cropSize);
        const sourceX = Math.max(0, Math.min(maxSourceX, anchor.x * image.naturalWidth - target.x * cropSize));
        const sourceY = Math.max(0, Math.min(maxSourceY, anchor.y * image.naturalHeight - target.y * cropSize));
        ctx.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
      } else {
        drawCover(ctx, image, outputSize);
      }
      return canvas.toDataURL("image/webp", .92);
    });
    return { applied: true, frames };
  } catch {
    return { applied: false, frames: sources };
  } finally {
    detector?.close();
  }
}

function drawScaledFrame(ctx: CanvasRenderingContext2D, image: HTMLImageElement, size: number, scale: number) {
  const dimension = size * scale;
  ctx.drawImage(image, (size - dimension) / 2, (size - dimension) / 2, dimension, dimension);
}

async function createLocalMotionFrames(sources: string[], stepsPerSegment = 7) {
  const images = await Promise.all(sources.map(loadImage));
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const motionFrames: string[] = [];

  for (let segment = 0; segment < images.length - 1; segment += 1) {
    const left = images[segment];
    const right = images[segment + 1];
    const start = segment === 0 ? 0 : 1;
    for (let step = start; step <= stepsPerSegment; step += 1) {
      const progress = step / stepsPerSegment;
      const eased = progress * progress * (3 - 2 * progress);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#d7d7d5";
      ctx.fillRect(0, 0, size, size);
      drawScaledFrame(ctx, left, size, 1 + eased * .006);
      ctx.globalAlpha = eased;
      drawScaledFrame(ctx, right, size, 1 + (1 - eased) * .006);
      motionFrames.push(canvas.toDataURL("image/webp", .86));
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  return motionFrames;
}

export default function Home() {
  const [faceA, setFaceA] = useState<string | null>(null);
  const [faceB, setFaceB] = useState<string | null>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [nameA, setNameA] = useState("等待本体");
  const [nameB, setNameB] = useState("等待夺舍者");
  const [directionKeywords, setDirectionKeywords] = useState("");
  const [ratio, setRatio] = useState(50);
  const [mode, setMode] = useState<MorphMode>("blend");
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [morphFrames, setMorphFrames] = useState<string[]>([]);
  const [motionFrames, setMotionFrames] = useState<string[]>([]);
  const [alignedFaceA, setAlignedFaceA] = useState<string | null>(null);
  const [alignmentApplied, setAlignmentApplied] = useState<boolean | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>("idle");
  const [progress, setProgress] = useState(0);
  const inputA = useRef<HTMLInputElement>(null);
  const inputB = useRef<HTMLInputElement>(null);
  const urlA = useRef<string | null>(null);
  const urlB = useRef<string | null>(null);
  const autoDirection = useRef(1);
  const generationController = useRef<AbortController | null>(null);
  const singleMode = Boolean(faceA && !faceB);
  const hasBothFaces = Boolean(faceA && faceB);
  const hasAiSequence = morphFrames.length === 6 && motionFrames.length >= 31;
  const semanticSequence = useMemo(
    () => faceA
      ? (hasAiSequence
          ? [alignedFaceA ?? faceA, ...morphFrames]
          : [faceA, ...(faceB ? [faceB] : [])])
      : [],
    [alignedFaceA, faceA, faceB, hasAiSequence, morphFrames],
  );
  const sequence = hasAiSequence ? motionFrames : semanticSequence;
  const sliderReady = hasAiSequence || hasBothFaces;
  const sequencePosition = sequence.length > 1 ? ratio / 100 * (sequence.length - 1) : 0;
  const leftIndex = sequence.length > 1 ? Math.min(sequence.length - 2, Math.floor(sequencePosition)) : 0;
  const localRatio = sequence.length > 1 ? sequencePosition - leftIndex : 0;
  const leftFrame = sequence[leftIndex] ?? faceA;
  const rightFrame = sequence[leftIndex + 1] ?? faceB;
  const stageSet = !faceA ? emptyStages : singleMode ? (directionKeywords.trim() ? customSingleStages : singleStages) : stages;
  const displayFrame = Math.round(ratio / 100 * (stageSet.length - 1));
  const stage = stageSet[displayFrame];
  const stageNumber = String(displayFrame).padStart(2, "0");

  useEffect(() => {
    if (!auto || !sliderReady) return;
    const timer = window.setInterval(() => {
      setRatio((current) => {
        let next = current + autoDirection.current * .9;
        if (next >= 100) { next = 100; autoDirection.current = -1; }
        if (next <= 0) { next = 0; autoDirection.current = 1; }
        return next;
      });
    }, 28);
    return () => window.clearInterval(timer);
  }, [auto, sliderReady]);

  useEffect(() => () => {
    generationController.current?.abort();
    if (urlA.current) URL.revokeObjectURL(urlA.current);
    if (urlB.current) URL.revokeObjectURL(urlB.current);
  }, []);

  function resetGeneratedFrames() {
    generationController.current?.abort();
    setMorphFrames([]);
    setMotionFrames([]);
    setAlignedFaceA(null);
    setAlignmentApplied(null);
    setGenerationState("idle");
    setProgress(0);
    setAuto(false);
  }

  function acceptFile(file: File | undefined, slot: FaceSlot) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("这不是照片，实验室暂时无法给压缩包变脸。");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("照片超过 15 MB，先给它瘦个身再来。");
      return;
    }
    resetGeneratedFrames();
    setError("");
    const url = URL.createObjectURL(file);
    if (slot === "a") {
      if (urlA.current) URL.revokeObjectURL(urlA.current);
      urlA.current = url;
      setFaceA(url);
      setFileA(file);
      setNameA(file.name);
    } else {
      if (urlB.current) URL.revokeObjectURL(urlB.current);
      urlB.current = url;
      setFaceB(url);
      setFileB(file);
      setNameB(file.name);
    }
  }

  async function generateMorphFrames() {
    if (!fileA || generationState === "generating") return;
    resetGeneratedFrames();
    setError("");
    setGenerationState("generating");
    setProgress(0);
    const controller = new AbortController();
    generationController.current = controller;

    try {
      const [preparedA, preparedB] = await Promise.all([
        prepareFace(fileA),
        fileB ? prepareFace(fileB) : Promise.resolve(null),
      ]);
      const seedArray = new Uint32Array(1);
      crypto.getRandomValues(seedArray);
      const sequenceSeed = seedArray[0] & 0x7fffffff;
      const body = new FormData();
      body.append("faceA", preparedA, "face-a.jpg");
      if (preparedB) body.append("faceB", preparedB, "face-b.jpg");
      if (!preparedB && directionKeywords.trim()) body.append("directionKeywords", directionKeywords.trim());
      body.append("sequenceSeed", String(sequenceSeed));
      const response = await fetch("/api/morph", { method: "POST", body, signal: controller.signal });
      const payload = await response.json() as { sheet?: string; error?: string };
      if (!response.ok || !payload.sheet) {
        throw new Error(payload.error || "AI 没能生成六宫格，请再试一次。");
      }

      setProgress(1);
      const [panels, preparedAUrl] = await Promise.all([
        splitContactSheet(payload.sheet),
        blobToDataUrl(preparedA),
      ]);
      setProgress(2);

      const rawSemanticFrames = [preparedAUrl, ...panels];
      const aligned = await alignFaceFrames(rawSemanticFrames);
      setAlignmentApplied(aligned.applied);
      setProgress(3);

      const localFrames = await createLocalMotionFrames(aligned.frames);
      setAlignedFaceA(aligned.frames[0]);
      setMorphFrames(aligned.frames.slice(1, 7));
      setMotionFrames(localFrames);
      setProgress(4);
      setGenerationState("ready");
      setRatio(0);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setGenerationState("error");
      setProgress(0);
      setError(cause instanceof Error ? cause.message : "AI 变脸机突然装死了，请再试一次。");
    } finally {
      generationController.current = null;
    }
  }

  function swapFaces() {
    if (!faceA || !faceB) return;
    resetGeneratedFrames();
    [urlA.current, urlB.current] = [urlB.current, urlA.current];
    setFaceA(faceB);
    setFaceB(faceA);
    setFileA(fileB);
    setFileB(fileA);
    setNameA(nameB);
    setNameB(nameA);
    setRatio(100 - ratio);
  }

  function clearFaceB() {
    if (!faceB) return;
    resetGeneratedFrames();
    if (urlB.current) URL.revokeObjectURL(urlB.current);
    urlB.current = null;
    setFaceB(null);
    setFileB(null);
    setNameB("等待夺舍者");
    setRatio(0);
  }

  function updateFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!sliderReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setRatio(Math.max(0, Math.min(100, next)));
  }

  function startPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!sliderReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setAuto(false);
    updateFromPointer(event);
  }

  async function downloadResult() {
    try {
      const size = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0b0c0e";
      ctx.fillRect(0, 0, size, size);
      if (!leftFrame || !rightFrame) return;
      const [imageA, imageB] = await Promise.all([loadImage(leftFrame), loadImage(rightFrame)]);
      drawCover(ctx, imageA, size);
      if (mode === "wipe") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, size * localRatio, size);
        ctx.clip();
        drawCover(ctx, imageB, size);
        ctx.restore();
      } else if (mode === "glitch") {
        ctx.globalAlpha = Math.max(.28, localRatio);
        ctx.globalCompositeOperation = "screen";
        ctx.save();
        ctx.translate((localRatio - .5) * 22, 0);
        drawCover(ctx, imageB, size);
        ctx.restore();
      } else {
        ctx.globalAlpha = localRatio;
        drawCover(ctx, imageB, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#62ecff";
      ctx.lineWidth = 4;
      ctx.strokeRect(24, 24, size - 48, size - 48);
      ctx.fillStyle = "rgba(11,12,14,.82)";
      ctx.fillRect(24, size - 116, size - 48, 92);
      ctx.fillStyle = "#62ecff";
      ctx.font = "700 26px ui-monospace, monospace";
      ctx.fillText(`SLIDE FACE / ${String(Math.round(ratio)).padStart(3, "0")}%`, 52, size - 62);
      ctx.fillStyle = "#dfff52";
      ctx.textAlign = "right";
      ctx.fillText(hasAiSequence ? `AI / ${sequence.length} FRAMES` : "LOCAL PREVIEW", size - 52, size - 62);
      const link = document.createElement("a");
      link.download = `slide-face-${Math.round(ratio)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      setError("导出时实验台抖了一下，请再试一次。");
    }
  }

  const layerAStyle = mode === "glitch"
    ? { opacity: Math.max(.38, 1 - localRatio * .72), transform: `translateX(${(localRatio - .5) * -8}px) scale(1.015)` }
    : { opacity: 1, transform: "scale(1)" };
  const layerBStyle = mode === "wipe"
    ? { opacity: 1, clipPath: `inset(0 ${100 - localRatio * 100}% 0 0)` }
    : mode === "glitch"
      ? { opacity: Math.max(.26, localRatio), transform: `translateX(${(localRatio - .5) * 10}px) scale(1.015)`, mixBlendMode: "screen" as const }
      : { opacity: localRatio, transform: "scale(1.002)" };
  const semanticDisplayIndex = semanticSequence.length > 1
    ? Math.round(ratio / 100 * (semanticSequence.length - 1))
    : 0;
  const filmstripFrames: Array<string | null> = faceA
    ? hasAiSequence
      ? semanticSequence
      : [faceA, ...Array.from({ length: 6 }, () => null), ...(faceB ? [faceB] : [])]
    : [];
  const status = generationState === "generating"
    ? "GENERATING"
    : hasAiSequence
      ? `${motionFrames.length}-FRAME READY`
      : faceA
        ? "AWAITING AI"
        : "STANDBY";

  return (
    <main className="calibrator-shell">
      <header className="masthead">
        <div><p className="eyebrow">AI chained-frame face chaos calibrator</p><h1>滑脸研究所</h1></div>
        <div className="status-strip" aria-label="系统状态">
          <span><i /> {status}</span>
          <span>1 OR 2 FACES / 1 PAID 2K SHEET / 43 LOCAL FRAMES</span>
        </div>
      </header>

      <section className="lab-grid" aria-label="AI 滑动变脸器">
        <div className={`portrait-stage ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptFile(event.dataTransfer.files[0], !faceA ? "a" : "b"); }}>
          <div className="stage-meta">
            <span>SUBJECT / {hasAiSequence ? `KEYFRAME ${semanticDisplayIndex + 1}/${semanticSequence.length}` : hasBothFaces ? "LOCAL PREVIEW" : faceA ? "AWAITING AI" : "NO PHOTO"}</span>
            <span>{hasAiSequence ? `6 GENERATED / ${motionFrames.length} LOCAL FRAMES` : "UPLOAD / GENERATE / SLIDE"}</span>
          </div>
          <div className={`morph-canvas mode-${mode} ${sliderReady ? "is-ready" : ""}`} onPointerDown={startPointer} onPointerMove={(event) => { if (dragging) updateFromPointer(event); }} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} aria-label={sliderReady ? `人物变脸预览，当前 ${Math.round(ratio)}%` : faceA ? "等待 AI 生成变脸序列" : "等待上传本体照片"}>
            {leftFrame && <img src={leftFrame} alt="当前变脸帧" className="face-layer layer-a" style={layerAStyle} />}
            {rightFrame && <img src={rightFrame} alt="下一变脸帧" className="face-layer layer-b" style={layerBStyle} />}
            {!faceA && <div className="face-placeholder" aria-hidden="true"><div className="scan-line" /><div className="placeholder-face"><i className="eye eye-left" /><i className="eye eye-right" /><i className="mouth" /></div><strong>等待照片</strong><small>先上传本体 · 夺舍者可选</small></div>}
            {faceA && !hasAiSequence && !faceB && <div className="single-wait" aria-hidden="true"><span>本体已就位</span><small>直接点击「AI 生六宫格」即可单脸进化</small></div>}
            {sliderReady && <><div className="scan-overlay" aria-hidden="true" /><div className="face-divider" style={{ left: `${ratio}%` }} aria-hidden="true"><span>↔</span></div><div className="face-tags" aria-hidden="true"><span>A / 本体</span><span>{hasAiSequence ? `KEYFRAME ${semanticDisplayIndex + 1} / ${semanticSequence.length}` : "AI 尚未介入"}</span><span>{faceB ? "B / 入侵者" : "强度终点"}</span></div></>}
          </div>
          {filmstripFrames.length > 0 && (
            <div className={`filmstrip ${hasAiSequence ? "is-ready" : ""}`} style={{ gridTemplateColumns: `repeat(${filmstripFrames.length}, 1fr)` }} aria-label={`${filmstripFrames.length} 阶段变脸胶片`}>
              {filmstripFrames.map((src, index) => {
                return <button type="button" key={index} className={semanticDisplayIndex === index ? "active" : ""} disabled={!src} onClick={() => { setRatio(index / Math.max(1, filmstripFrames.length - 1) * 100); setAuto(false); }} aria-label={`查看第 ${index + 1} 阶段`}>{src ? <img src={src} alt="" /> : <span>{generationState === "generating" ? index : "?"}</span>}<small>{String(index + 1).padStart(2, "0")}</small></button>;
              })}
            </div>
          )}
          <div className="corner corner-tl" /><div className="corner corner-br" />
        </div>

        <aside className="control-panel">
          <p className="stage-index">{stageNumber}</p>
          <div className="panel-copy"><p className="kicker">PHASE {stageNumber} / ONE-SHOT CONTACT SHEET</p><h2>{stage.title}</h2><p className="stage-note">{stage.note}</p></div>
          <div className="upload-row">
            <input ref={inputA} className="visually-hidden" type="file" accept="image/*" onChange={(event) => acceptFile(event.target.files?.[0], "a")} />
            <input ref={inputB} className="visually-hidden" type="file" accept="image/*" onChange={(event) => acceptFile(event.target.files?.[0], "b")} />
            <button type="button" className={`upload-card ${faceA ? "has-file" : ""}`} onClick={() => inputA.current?.click()}><span>01</span><strong>{faceA ? "更换本体" : "上传本体"}</strong><small title={nameA}>{faceA ? nameA : "FACE A · JPG / PNG"}</small></button>
            <button type="button" className={`upload-card alt ${faceB ? "has-file" : ""}`} onClick={() => inputB.current?.click()}><span>02</span><strong>{faceB ? "更换夺舍者" : "上传夺舍者（可选）"}</strong><small title={nameB}>{faceB ? nameB : "OPTIONAL · TWO-FACE MODE"}</small></button>
          </div>
          {faceB && <button type="button" className="clear-target" onClick={clearFaceB}>× 清除夺舍者，切回单脸模式</button>}

          {faceA && (
            <div className={`ai-generator state-${generationState}`}>
              {singleMode && <label className="direction-field"><span>变化方向关键词 <b>可选</b></span><input type="text" maxLength={120} value={directionKeywords} disabled={generationState === "generating"} onChange={(event) => setDirectionKeywords(event.target.value)} placeholder="留空默认：抽象丑化、扭曲怪笑" aria-label="单人模式变化方向关键词" /><small>{directionKeywords.length}/120 · 例如：逐渐变成河马、赛博故障脸、笑成液体</small></label>}
            <div className="ai-generator-copy"><span>ARK · SEEDREAM 5.0 PRO / {singleMode ? "SINGLE FACE" : "TWO FACES"} / ONE PAID 2K SHEET</span><strong>{generationState === "generating" ? progressCopy[Math.min(3, progress)] : hasAiSequence ? "六宫格已切开、对齐并补帧" : singleMode ? "一张脸也能一次生成整套" : "一次生成六张连续脸"}</strong><small>{generationState === "generating" ? `已完成 ${progress}/4 个处理阶段；Ark 付费生成只调用一次` : hasAiSequence ? `1 次 Ark + ${motionFrames.length} 张本地过渡帧${alignmentApplied ? "，人脸对齐已生效" : "，人脸检测已自动降级"}` : "一次生成 2K 六宫格；切图、对齐和 43 张过渡帧都在本地完成"}</small></div>
              <button type="button" onClick={generateMorphFrames} disabled={generationState === "generating"}>{generationState === "generating" ? "处理中" : hasAiSequence ? "重新生成" : generationState === "error" ? "再捏一次" : "AI 生六宫格 →"}</button>
              <div className="generation-meter" aria-label={`生成处理进度 ${progress}/4`}>{Array.from({ length: 4 }, (_, index) => <i key={index} className={progress > index ? "done" : ""} />)}</div>
            </div>
          )}
          {error && <p className="error-message" role="alert">⚠ {error}</p>}

          <div className="slider-control">
            <div className="slider-head"><span>{hasAiSequence ? `SCRUB ${motionFrames.length} LOCAL FRAMES` : hasBothFaces ? "LOCAL PREVIEW" : "WAITING FOR AI"}</span><b>{String(Math.round(ratio)).padStart(3, "0")}%</b></div>
            <input type="range" min="0" max="100" step="0.1" value={ratio} disabled={!sliderReady} onChange={(event) => { setRatio(Number(event.target.value)); setAuto(false); }} aria-label="人物滑动变脸强度" style={{ "--ratio": `${ratio}%` } as CSSProperties} />
            <div className="track-labels"><span>100% 本体</span><span>{hasAiSequence ? "同一张六宫格 + 本地补帧" : "等待 AI 生成"}</span><span>{faceB ? "夺舍者 100%" : "强度终点"}</span></div>
          </div>
          <div className="mode-section"><p>SELECT BETWEEN-FRAME TRANSITION</p><div className="mode-row">{modes.map((item) => <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}><span>{item.label}</span><small>{item.code}</small></button>)}</div></div>
          <div className="action-row"><button type="button" onClick={() => setAuto((value) => !value)} disabled={!sliderReady}>{auto ? "■ 停止发疯" : "▶ 自动发疯"}</button><button type="button" onClick={swapFaces} disabled={!hasBothFaces}>⇄ 交换两脸</button><button type="button" className="download-button" onClick={downloadResult} disabled={!sliderReady}>↓ 保存当前帧</button></div>
          <p className="privacy-note"><span>ONE PAID CALL</span> 点击生成会发送已上传的一或两张照片，只请求 1 张 2K 六宫格；人脸对齐和补帧均在浏览器本地完成。</p>
        </aside>
      </section>
      <footer className="ticker" aria-hidden="true"><span>UPLOAD × 1 OR 2</span><b>→</b><span>GENERATE × 1</span><b>→</b><span>SPLIT × 6</span><b>→</b><span>LOCAL × {hasAiSequence ? motionFrames.length : "43"}</span></footer>
    </main>
  );
}
