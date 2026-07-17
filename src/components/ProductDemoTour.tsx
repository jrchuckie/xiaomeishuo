import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Heart,
  Images,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  ScanFace,
  Scissors,
  Share2,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Syringe,
  UserRoundSearch,
  X,
} from "lucide-react";
import "../demo-tour.css";

type SceneId =
  | "opening"
  | "collection"
  | "audit"
  | "profile"
  | "face"
  | "boundaries"
  | "direction"
  | "front-result"
  | "side-result"
  | "plan"
  | "complete";

type TourScene = {
  id: SceneId;
  step: string;
  nav: string;
  duration: number;
};

const TOUR_SCENES: TourScene[] = [
  { id: "opening", step: "00", nav: "开始", duration: 3600 },
  { id: "collection", step: "01", nav: "收藏", duration: 4600 },
  { id: "audit", step: "02", nav: "核验", duration: 4300 },
  { id: "profile", step: "03", nav: "画像", duration: 4800 },
  { id: "face", step: "04", nav: "本人", duration: 4300 },
  { id: "boundaries", step: "05", nav: "边界", duration: 4400 },
  { id: "direction", step: "06", nav: "方向", duration: 4500 },
  { id: "front-result", step: "07", nav: "正脸", duration: 4700 },
  { id: "side-result", step: "08", nav: "侧脸", duration: 4700 },
  { id: "plan", step: "09", nav: "方案", duration: 5600 },
  { id: "complete", step: "10", nav: "完成", duration: 5000 },
];

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const REFERENCE_IMAGES = [
  "demo-tour/references/微信图片_20260716110130_83_19.jpg",
  "demo-tour/references/微信图片_20260716110134_85_19.jpg",
  "demo-tour/references/微信图片_20260716110132_84_19.jpg",
  "demo-tour/references/微信图片_20260716110139_89_19.jpg",
  "demo-tour/references/微信图片_20260716110145_93_19.jpg",
  "demo-tour/references/微信图片_20260716110136_87_19.jpg",
  "demo-tour/references/微信图片_20260716110140_90_19.jpg",
  "demo-tour/references/微信图片_20260716110148_95_19.jpg",
  "demo-tour/references/微信图片_20260716110138_88_19.jpg",
  "demo-tour/references/微信图片_20260716110143_91_19.jpg",
  "demo-tour/references/微信图片_20260716110152_96_19.jpg",
].map(assetUrl);

const NARRATIVE: Record<SceneId, { eyebrow: string; title: string; body: string }> = {
  opening: {
    eyebrow: "AI 个人审美决策平台",
    title: "先读懂你喜欢的美，\n再讨论怎么改变",
    body: "从收藏中学习长期偏好，再结合本人条件、现实边界与既往治疗，生成可比较、可分阶段行动的方案。",
  },
  collection: {
    eyebrow: "01 / 导入审美样本",
    title: "你的收藏，\n已经藏着答案",
    body: "系统读取用户主动选择的 11 张参考内容，不用一套主流模板猜测用户想成为什么样的人。",
  },
  audit: {
    eyebrow: "02 / 参考图真实性核验",
    title: "先去掉噪声，\n再学习审美",
    body: "识别非面部样本、角度与滤镜干扰，以及疑似 AI 或重度修图内容，避免从不真实案例反推方案。",
  },
  profile: {
    eyebrow: "03 / 个人审美画像",
    title: "不是一个标签，\n而是一套审美坐标",
    body: "画像具体到轮廓、五官、眉形、发型、肤色与反目标，并用用户自己的样本解释每一个判断。",
  },
  face: {
    eyebrow: "04 / 本人真实现状",
    title: "参考图是方向，\n本人条件是边界",
    body: "用无修饰正脸和侧脸校准可实现范围。系统保留身份、肤色、发型、表情、角度与光线。",
  },
  boundaries: {
    eyebrow: "05 / 预算与项目偏好",
    title: "好的方案，\n必须尊重你的边界",
    body: "结合预算、恢复期、侵入性偏好与既往治疗，避免重复叠加，也避免推荐用户明确拒绝的变化。",
  },
  direction: {
    eyebrow: "06 / 选择改变方向",
    title: "用户决定想改什么，\n也决定什么不改",
    body: "本次聚焦轮廓：降低颧部突兀感、强化下巴与下颌线；保留暖肤色、当前发型与原生男性厚度。",
  },
  "front-result": {
    eyebrow: "07 / 正脸方向模拟",
    title: "变化必须一眼可见，\n也必须还是本人",
    body: "下庭更稳定、颧部过渡更协调、下颌边界更清楚；不美白、不磨皮、不改发型、不换五官。",
  },
  "side-result": {
    eyebrow: "08 / 侧脸方向模拟",
    title: "把变化落到\n具体结构上",
    body: "用侧脸检查下巴投射、颏颈线和颧下支撑，防止正面看似变窄、侧面却出现不自然的填充感。",
  },
  plan: {
    eyebrow: "09 / 分阶段行动方案",
    title: "先做什么、再看什么，\n最后决定什么",
    body: "每一步写清目标、项目、参考范围、观察周期、替代路线与不建议项，形成可以带去面诊的清单。",
  },
  complete: {
    eyebrow: "IDEAL ME PLAN / READY",
    title: "成为自己眼中，\n更好的自己",
    body: "美没有统一答案。你真正喜欢的样子，才是变美的起点。",
  },
};

function BrandMark() {
  return (
    <span className="tour-brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

function PhoneFrame({ scene }: { scene: SceneId }) {
  const title = useMemo(() => {
    const labels: Record<SceneId, string> = {
      opening: "小美说",
      collection: "导入我的审美样本",
      audit: "参考图真实性核验",
      profile: "我的个人审美画像",
      face: "本人真实现状",
      boundaries: "预算与项目偏好",
      direction: "选择改变方向",
      "front-result": "效果模拟 · 正脸",
      "side-result": "效果模拟 · 侧脸",
      plan: "我的 Ideal Me Plan",
      complete: "方案已生成",
    };
    return labels[scene];
  }, [scene]);

  return (
    <div className={`tour-phone ${scene === "opening" ? "is-opening" : ""}`}>
      <div className="tour-phone-status">
        <span>9:41</span>
        <span className="tour-phone-island" />
        <span>5G&nbsp;&nbsp;●</span>
      </div>
      {scene !== "opening" ? (
        <div className="tour-phone-header">
          <ArrowLeft size={18} strokeWidth={2.2} />
          <strong>{title}</strong>
          <span className="tour-header-action"><Share2 size={17} /></span>
        </div>
      ) : null}
      <div className="tour-phone-screen" key={scene}>
        <PhoneScene scene={scene} />
      </div>
      {scene !== "opening" && scene !== "complete" ? (
        <div className="tour-step-rail" aria-hidden="true">
          {TOUR_SCENES.slice(1, -1).map((item) => (
            <i key={item.id} className={TOUR_SCENES.findIndex((entry) => entry.id === item.id) <= TOUR_SCENES.findIndex((entry) => entry.id === scene) ? "done" : ""} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhoneScene({ scene }: { scene: SceneId }) {
  if (scene === "opening") return <OpeningScene />;
  if (scene === "collection") return <CollectionScene />;
  if (scene === "audit") return <AuditScene />;
  if (scene === "profile") return <ProfileScene />;
  if (scene === "face") return <FaceScene />;
  if (scene === "boundaries") return <BoundariesScene />;
  if (scene === "direction") return <DirectionScene />;
  if (scene === "front-result") return <ResultScene view="front" />;
  if (scene === "side-result") return <ResultScene view="side" />;
  if (scene === "plan") return <PlanScene />;
  return <CompleteScene />;
}

function OpeningScene() {
  return (
    <div className="tour-opening-scene">
      <div className="tour-opening-brand">
        <BrandMark />
        <div><strong>小美说</strong><span>XIAOMEISHUO</span></div>
      </div>
      <h2>美没有统一答案</h2>
      <p>你真正喜欢的样子，<br />才是变美的起点。</p>
      <div className="tour-opening-flow">
        <span>审美</span><i /><span>本人</span><i /><span>方案</span>
      </div>
    </div>
  );
}

function CollectionScene() {
  return (
    <div className="tour-mobile-page collection-page">
      <div className="tour-page-lead">
        <span className="tour-kicker">来自小红书收藏夹</span>
        <h3>选出“我想成为的样子”</h3>
        <p>已导入 11 张审美样本</p>
      </div>
      <div className="tour-reference-grid">
        {REFERENCE_IMAGES.map((src, index) => (
          <figure key={src} style={{ "--delay": `${index * 45}ms` } as CSSProperties}>
            <img src={src} alt="用户收藏的审美参考" />
            <span><Check size={11} strokeWidth={3} /></span>
          </figure>
        ))}
      </div>
      <div className="tour-import-bar"><Images size={16} /><strong>11 张已导入</strong><span>开始分析</span></div>
    </div>
  );
}

function AuditScene() {
  const accepted = [REFERENCE_IMAGES[1], REFERENCE_IMAGES[2], REFERENCE_IMAGES[3], REFERENCE_IMAGES[4]];
  const review = [REFERENCE_IMAGES[0], REFERENCE_IMAGES[6], REFERENCE_IMAGES[7]];
  return (
    <div className="tour-mobile-page audit-page">
      <div className="tour-page-lead compact">
        <span className="tour-kicker">可信样本 11 / 11</span>
        <h3>先核验，再学习</h3>
      </div>
      <section className="tour-audit-section">
        <div className="tour-section-label"><span><BadgeCheck size={15} />面部与轮廓样本</span><b>7 张</b></div>
        <div className="tour-audit-row accepted">
          {accepted.map((src) => <figure key={src}><img src={src} alt="面部与轮廓参考图" /><span><Check size={12} /></span></figure>)}
        </div>
      </section>
      <section className="tour-audit-section">
        <div className="tour-section-label"><span><ShieldCheck size={15} />体态与气质样本</span><b>4 张</b></div>
        <div className="tour-audit-row review">
          {review.map((src, index) => (
            <figure key={src}>
              <img src={src} alt="体态与气质参考图" />
              <figcaption>{index === 0 ? "体态与力量感" : index === 1 ? "成熟绅装气质" : "健康户外感"}</figcaption>
              <span><Check size={12} /></span>
            </figure>
          ))}
          <div className="tour-ai-check"><BadgeCheck size={17} /><strong>AI / 重修疑似 0</strong><small>全部通过真实性核验</small></div>
        </div>
      </section>
      <p className="tour-inline-note">面部样本用于理解轮廓，体态与穿搭样本用于理解整体气质。</p>
    </div>
  );
}

function ProfileScene() {
  return (
    <div className="tour-mobile-page profile-page">
      <div className="tour-profile-hero">
        <div className="tour-profile-collage">
          {[REFERENCE_IMAGES[1], REFERENCE_IMAGES[2], REFERENCE_IMAGES[3]].map((src) => <img key={src} src={src} alt="审美画像参考样本" />)}
        </div>
        <span>IDEAL ME PROFILE 01</span>
        <h3>硬朗、运动感的成熟男性气质</h3>
        <p>健康暖肤色 · 清晰骨相 · 克制力量感</p>
      </div>
      <div className="tour-profile-list">
        <ProfileRow icon={<ScanFace />} label="轮廓" value="方钝下巴、清晰下颌线，保留颧骨与面部厚度" />
        <ProfileRow icon={<UserRoundSearch />} label="五官" value="浓眉、短胡须与自然眼型，不追求精致放大" />
        <ProfileRow icon={<SunMedium />} label="肤色" value="健康暖肤色与真实纹理，不美白、不磨皮" />
        <ProfileRow icon={<Scissors />} label="发型 / 风格" value="短发利落；运动、机能与绅装均保持成熟感" />
      </div>
      <div className="tour-anti-target"><X size={15} /><span><b>反目标</b> 白净幼态、尖下巴、饱满苹果肌、过度精修与网红填充感</span></div>
    </div>
  );
}

function ProfileRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="tour-profile-row"><span>{icon}</span><div><b>{label}</b><p>{value}</p></div></div>;
}

function FaceScene() {
  return (
    <div className="tour-mobile-page face-page">
      <div className="tour-page-lead compact">
        <span className="tour-kicker">无滤镜 · 同光线 · 无表情</span>
        <h3>建立本人真实基线</h3>
      </div>
      <div className="tour-face-pair">
        <figure><img src={assetUrl("demo-tour/face-front.jpg")} alt="本人正脸照片" /><figcaption>正脸 <Check size={13} /></figcaption></figure>
        <figure><img src={assetUrl("demo-tour/face-side.jpg")} alt="本人侧脸照片" /><figcaption>侧脸 <Check size={13} /></figcaption></figure>
      </div>
      <div className="tour-face-checks">
        <span><Check />身份一致</span><span><Check />光线可用</span><span><Check />角度合格</span><span><Check />未检测到美颜</span>
      </div>
      <div className="tour-baseline-callout"><ScanFace size={22} /><div><strong>本人映射已完成</strong><p>参考审美将受真实骨点、软组织与既往治疗约束。</p></div></div>
    </div>
  );
}

function BoundariesScene() {
  return (
    <div className="tour-mobile-page boundaries-page">
      <div className="tour-page-lead compact">
        <span className="tour-kicker">现实边界</span>
        <h3>先排除不适合的答案</h3>
      </div>
      <div className="tour-boundary-grid">
        <Boundary icon={<CircleDollarSign />} label="总预算" value="1–3 万" active />
        <Boundary icon={<Camera />} label="恢复期" value="7 天以内" />
        <Boundary icon={<Syringe />} label="可接受" value="针剂 / 光电" />
        <Boundary icon={<ShieldCheck />} label="暂不接受" value="手术 / 削骨" />
      </div>
      <div className="tour-history-block">
        <span>既往治疗</span>
        <strong>下巴与鼻基底已有填充基础</strong>
        <p>系统不会把已做区域机械叠加到默认方案。</p>
      </div>
      <div className="tour-preserve-list">
        <div><Check /><span><b>保留自然暖肤色</b><small>不要美白</small></span></div>
        <div><Check /><span><b>保留当前发型与发际线</b><small>不要改变</small></span></div>
        <div><Check /><span><b>保留男性厚度</b><small>不要尖脸与幼态</small></span></div>
      </div>
    </div>
  );
}

function Boundary({ icon, label, value, active = false }: { icon: ReactNode; label: string; value: string; active?: boolean }) {
  return <div className={active ? "is-active" : ""}><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function DirectionScene() {
  return (
    <div className="tour-mobile-page direction-page">
      <div className="tour-direction-face">
        <img src={assetUrl("demo-tour/face-front.jpg")} alt="本人正脸与轮廓选择区域" />
        <i className="face-zone cheek-left" /><i className="face-zone cheek-right" /><i className="face-zone chin" />
        <span className="zone-label cheek">颧下过渡</span><span className="zone-label jaw">下巴 · 下颌</span>
      </div>
      <div className="tour-direction-summary">
        <span>本轮主方向</span>
        <h3>轮廓平衡与下庭支撑</h3>
        <p>降低颧部突兀感，让下巴与下颌线接住中面。</p>
      </div>
      <div className="tour-direction-options">
        <DirectionOption label="轮廓" value="强化" selected />
        <DirectionOption label="眉形" value="轻调" />
        <DirectionOption label="肤色" value="保留" />
        <DirectionOption label="发型" value="保留" />
      </div>
      <div className="tour-do-not-change"><ShieldCheck size={16} /><span>锁定：不美白 · 不改发型 · 不做尖下巴</span></div>
    </div>
  );
}

function DirectionOption({ label, value, selected = false }: { label: string; value: string; selected?: boolean }) {
  return <div className={selected ? "selected" : ""}><small>{label}</small><strong>{value}</strong>{selected ? <Check size={14} /> : null}</div>;
}

function ResultScene({ view }: { view: "front" | "side" }) {
  const isFront = view === "front";
  const before = assetUrl(isFront ? "demo-tour/curated/front-before.jpg" : "demo-tour/curated/side-before.jpg");
  const after = assetUrl(isFront ? "demo-tour/curated/front-after.jpg" : "demo-tour/curated/side-after.jpg");
  return (
    <div className="tour-mobile-page result-page">
      <div className="tour-result-tabs"><span className={isFront ? "active" : ""}>正脸</span><span className={!isFront ? "active" : ""}>右侧脸</span></div>
      <div className="tour-result-title"><span>人工复核方向模拟</span><strong>{isFront ? "轮廓平衡 · 正脸" : "下庭投射 · 侧脸"}</strong></div>
      <div className={`tour-before-after ${isFront ? "front" : "side"}`}>
        <figure><img src={before} alt="模拟前" /><figcaption>BEFORE <b>原始</b></figcaption></figure>
        <span className="tour-result-arrow"><ChevronRight /></span>
        <figure><img src={after} alt="模拟后" /><figcaption>AFTER <b>方向模拟</b></figcaption></figure>
      </div>
      <div className="tour-change-list">
        {(isFront
          ? ["颧部不再抢眼", "下脸更稳、更有力量", "保留原生暖肤与纹理"]
          : ["下巴投射更明确", "颏颈线更利落", "颧下过渡保留骨感"]
        ).map((item) => <span key={item}><Check size={13} />{item}</span>)}
      </div>
      <p className="tour-simulation-note"><ShieldCheck size={13} />方向模拟，不构成医疗效果承诺；最终范围由面诊确认。</p>
    </div>
  );
}

function PlanScene() {
  return (
    <div className="tour-mobile-page plan-page">
      <div className="tour-plan-head">
        <span>IDEAL ME PERSONAL PLAN 01</span>
        <h3>先放松与观察，再决定是否补充支撑</h3>
        <p>轮廓优先 · 保留原生肤色 · 不进入默认叠加方案</p>
      </div>
      <div className="tour-plan-phases">
        <article className="now">
          <span>PHASE 1 · 先做</span>
          <h4>可逆、低负担验证</h4>
          <div><Syringe /><p><b>颏肌放松</b><small>肉毒 4–8U 总量，医生面诊确认</small></p></div>
          <div><Syringe /><p><b>咬肌边缘优化</b><small>15–20U / 侧，保留男性咬肌厚度</small></p></div>
          <em>观察 4–6 周</em>
        </article>
        <article>
          <span>PHASE 2 · 再评估</span>
          <h4>颧下与下庭连接</h4>
          <div><Layers3 /><p><b>颧下支撑</b><small>先 0.5–1ml / 侧，分次观察</small></p></div>
          <div><ScanFace /><p><b>下巴仅精修</b><small>既往已有基础，不默认再加 2ml</small></p></div>
          <em>复拍正侧脸后决定</em>
        </article>
      </div>
      <div className="tour-not-recommended"><X size={15} /><span><b>本轮不建议</b> 美白、改变发型或发际线、大量苹果肌填充、强瘦脸、直接叠加下巴</span></div>
    </div>
  );
}

function CompleteScene() {
  return (
    <div className="tour-mobile-page complete-page">
      <div className="tour-complete-icon"><FileText size={34} /><span><Check size={17} /></span></div>
      <span>你的 Ideal Me Plan 已生成</span>
      <h3>保留你的特色，<br />把改变分阶段做对</h3>
      <div className="tour-complete-stats"><div><strong>11</strong><span>可信样本</span></div><div><strong>4</strong><span>现实边界</span></div><div><strong>2</strong><span>行动阶段</span></div></div>
      <div className="tour-complete-preview">
        <img src={assetUrl("demo-tour/curated/front-after.jpg")} alt="最终方向模拟" />
        <div><span>面诊重点</span><strong>颏肌 · 咬肌 · 颧下支撑</strong><p>含项目范围、观察周期与不建议项</p></div>
      </div>
      <button type="button"><Bookmark size={17} />保存面诊清单</button>
      <p>美没有统一答案。<br /><b>你真正喜欢的样子，才是变美的起点。</b></p>
    </div>
  );
}

function NarrativePanel({ scene }: { scene: SceneId }) {
  const copy = NARRATIVE[scene];
  const proof: Record<SceneId, string[]> = {
    opening: ["个人审美", "真实本人", "现实可达"],
    collection: ["11 张真实收藏", "用户主动选择", "不套主流模板"],
    audit: ["真实性核验", "面部与轮廓", "体态与气质"],
    profile: ["轮廓", "五官", "肤色", "发型", "反目标"],
    face: ["正脸", "侧脸", "无美颜", "身份锁定"],
    boundaries: ["预算 1–3 万", "恢复 ≤7 天", "不美白", "不改发型"],
    direction: ["轮廓优先", "保留肤色", "保留发型", "拒绝尖脸"],
    "front-result": ["同一人物", "同一角度", "同一肤色", "变化清晰"],
    "side-result": ["下巴投射", "颏颈线", "颧下过渡", "保留骨点"],
    plan: ["项目", "参考量", "部位", "周期", "不建议项"],
    complete: ["可见", "可比", "可分阶段行动"],
  };
  return (
    <aside className={`tour-narrative scene-${scene}`} key={scene}>
      <span className="tour-narrative-eyebrow">{copy.eyebrow}</span>
      <h1>{copy.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
      <p>{copy.body}</p>
      <div className="tour-proof-chips">{proof[scene].map((item) => <span key={item}>{item}</span>)}</div>
      {scene === "audit" ? <div className="tour-proof-statement"><ShieldCheck /><span>没有通过真实性核验的参考，不进入审美画像和效果模拟。</span></div> : null}
      {scene === "direction" ? <div className="tour-proof-statement red"><Heart /><span>用户选择的“不要”，和“想要”同样重要。</span></div> : null}
      {scene === "plan" ? <div className="tour-proof-statement"><FileText /><span>输出的是面诊准备与决策支持，不替代医生诊断。</span></div> : null}
      <div className="tour-scene-count"><b>{TOUR_SCENES.findIndex((item) => item.id === scene).toString().padStart(2, "0")}</b><span>/</span><small>{(TOUR_SCENES.length - 1).toString().padStart(2, "0")}</small></div>
    </aside>
  );
}

export default function ProductDemoTour() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const captureMode = params.get("capture") === "1";
  const autoplay = params.get("autoplay") !== "0";
  const requestedScene = Number(params.get("scene") ?? 0);
  const initialScene = Number.isFinite(requestedScene)
    ? Math.max(0, Math.min(TOUR_SCENES.length - 1, requestedScene))
    : 0;
  const [sceneIndex, setSceneIndex] = useState(initialScene);
  const [playing, setPlaying] = useState(autoplay);
  const scene = TOUR_SCENES[sceneIndex];

  useEffect(() => {
    document.documentElement.classList.add("product-tour-mode");
    document.body.classList.add("product-tour-mode");
    return () => {
      document.documentElement.classList.remove("product-tour-mode");
      document.body.classList.remove("product-tour-mode");
    };
  }, []);

  useEffect(() => {
    document.body.dataset.demoScene = scene.id;
    window.dispatchEvent(new CustomEvent("xiaomeishuo-demo-scene", { detail: { index: sceneIndex, id: scene.id } }));
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (sceneIndex >= TOUR_SCENES.length - 1) {
        setPlaying(false);
        document.body.dataset.demoComplete = "true";
        return;
      }
      setSceneIndex((value) => value + 1);
    }, scene.duration);
    return () => window.clearTimeout(timer);
  }, [playing, scene.duration, scene.id, sceneIndex]);

  const move = (direction: number) => {
    setSceneIndex((value) => Math.max(0, Math.min(TOUR_SCENES.length - 1, value + direction)));
    setPlaying(false);
  };

  const restart = () => {
    delete document.body.dataset.demoComplete;
    setSceneIndex(0);
    setPlaying(true);
  };

  return (
    <main className={`product-demo-tour ${captureMode ? "capture-mode" : ""}`}>
      <header className="tour-topbar">
        <div className="tour-brand"><BrandMark /><strong>小美说</strong><span>AI 个人审美决策平台</span></div>
        <div className="tour-progress-nav">
          {TOUR_SCENES.slice(1).map((item, index) => (
            <span key={item.id} className={index + 1 <= sceneIndex ? "done" : ""}><i />{item.nav}</span>
          ))}
        </div>
        <span className="tour-demo-label">PRODUCT DEMO</span>
      </header>
      <section className={`tour-stage scene-${scene.id}`}>
        <div className="tour-phone-column"><PhoneFrame scene={scene.id} /></div>
        <NarrativePanel scene={scene.id} />
      </section>
      {!captureMode ? (
        <nav className="tour-controls" aria-label="演示控制">
          <button type="button" onClick={() => move(-1)} aria-label="上一步" disabled={sceneIndex === 0}><ChevronLeft /></button>
          <button type="button" className="primary" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause /> : <Play />}</button>
          <button type="button" onClick={() => move(1)} aria-label="下一步" disabled={sceneIndex === TOUR_SCENES.length - 1}><ChevronRight /></button>
          <button type="button" onClick={restart} aria-label="重新播放"><RotateCcw /></button>
        </nav>
      ) : null}
    </main>
  );
}
