# 滑脸研究所

一个搞怪的 AI 滑动变脸器：上传一张照片，可以把本人逐步变成抽象、扭曲的怪笑版本；再上传一张“夺舍者”照片，则会生成两张脸之间的连续过渡。

项目只请求一次 Seedream 2K 六宫格，随后在浏览器里完成切图、人脸对齐和 43 张本地过渡帧，尽量兼顾连续性与调用成本。

## 功能

- 单脸模式：默认逐步丑化和喜剧性扭曲，也支持输入自定义变化方向
- 双脸模式：按 16%、33%、50%、67%、84%、100% 逐步接近目标人物
- 一次付费生图：一次生成六张语义关键帧
- 本地处理：MediaPipe 人脸对齐、六宫格切图和过渡帧补全均在浏览器完成
- 三种滑动效果：混合、扫描和故障风格
- 当前帧可导出为 PNG

本仓库不包含默认人物 Demo、预生成视频、线上 Sites 项目标识或任何 API Key。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 中配置火山方舟密钥：

```dotenv
ARK_API_KEY=your_ark_api_key
```

然后打开终端输出的本地地址。不要提交 `.env.local`；项目已默认忽略所有 `.env*` 文件，只允许提交空值模板 `.env.example`。

## 构建与测试

```bash
npm run build
npm test
npm run lint
```

## 模型接入

服务端路由位于 `app/api/morph/route.ts`，默认调用：

- Endpoint: `https://ark.cn-beijing.volces.com/api/v3/images/generations`
- Model: `doubao-seedream-5-0-pro-260628`
- Output: 一张 2K、3 × 2 六宫格

密钥只在服务端读取，不会写入前端代码或返回给浏览器。部署到其他平台时，请在平台的服务端环境变量中配置 `ARK_API_KEY`。

## 技术栈

- React 19 + vinext
- Cloudflare Workers 兼容服务端运行时
- MediaPipe Tasks Vision
- Canvas 本地切图、对齐、补帧与导出

## 隐私提示

点击生成后，上传的一张或两张照片会发送到已配置的火山方舟图片生成接口。人脸对齐与过渡帧生成在浏览器本地执行。
