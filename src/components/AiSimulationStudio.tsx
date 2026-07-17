import { CircleAlert, Columns2, ImageOff, LoaderCircle, RefreshCcw, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { generateSimulationWithAI } from "../lib/ai";
import { loadLocal, saveLocal } from "../lib/storage";
import type { CaptureKind, FaceCapture, FeatureSelections, PersonalPlan, SimulationEngine, SimulationResult, VisualScenario } from "../types";

type Props = {
  captures: FaceCapture[];
  plan: PersonalPlan;
  selections: FeatureSelections;
};

const ANGLE_LABELS: Record<CaptureKind, string> = {
  front: "正脸",
  left: "左侧脸",
  right: "右侧脸",
};

const ENGINE_LABELS: Record<SimulationEngine, { name: string; note: string }> = {
  "gpt-image": { name: "GPT Image 2", note: "结构变化更清楚" },
  seedream: { name: "Seedream 5.0 Pro", note: "身份保留对照" },
};

const FALLBACK_SCENARIOS: VisualScenario[] = [
  {
    id: "stage-1",
    label: "阶段 1",
    title: "低风险方向验证",
    summary: "先看可逆、低负担改变是否已经足够。",
    changes: ["仅呈现妆发、眉形与轻微状态优化"],
    unchanged: ["五官身份", "骨性轮廓", "真实肤色与皮肤纹理"],
  },
  {
    id: "stage-2",
    label: "阶段 2",
    title: "保守结构优化",
    summary: "按方案中的保守路径呈现结构方向。",
    changes: ["呈现方案中优先级最高的保守结构变化"],
    unchanged: ["个人辨识度", "未选择的五官", "背景、表情与光线"],
  },
  {
    id: "stage-3",
    label: "阶段 3",
    title: "完整审美方向",
    summary: "把已确认方向组合起来，用于比较而非效果承诺。",
    changes: ["组合已确认的面部与造型方向"],
    unchanged: ["身份与年龄", "原生肤色", "未进入方案的区域"],
  },
];

function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export default function AiSimulationStudio({ captures, plan, selections }: Props) {
  const scenarios = plan.visualScenarios?.length === 3 ? plan.visualScenarios : FALLBACK_SCENARIOS;
  const angles = captures.map((capture) => capture.kind);
  const [stageId, setStageId] = useState<VisualScenario["id"]>(scenarios[0].id);
  const [angle, setAngle] = useState<CaptureKind>(angles.includes("front") ? "front" : angles[0] ?? "front");
  const [engine, setEngine] = useState<SimulationEngine>("gpt-image");
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loadingKey, setLoadingKey] = useState("");
  const [error, setError] = useState("");
  const [compare, setCompare] = useState(50);
  const [compareMode, setCompareMode] = useState<"side" | "slider">("side");

  useEffect(() => {
    void loadLocal<SimulationResult[]>("simulations").then((stored) => {
      if (stored) setResults(stored);
    });
  }, []);

  const scenario = scenarios.find((item) => item.id === stageId) ?? scenarios[0];
  const target = captures.find((capture) => capture.kind === angle);
  const result = results.find((item) => item.stageId === stageId && item.angle === angle && (item.engine ?? "seedream") === engine);
  const beforeUrl = useBlobUrl(target?.blob);
  const afterUrl = useBlobUrl(result?.image);
  const key = `${engine}:${stageId}:${angle}`;
  const isLoading = loadingKey === key;

  const identityReferences = useMemo(
    () => captures.filter((capture) => capture.kind !== angle),
    [angle, captures],
  );

  const generate = async () => {
    if (!target) return;
    setError("");
    setLoadingKey(key);
    try {
      const next = await generateSimulationWithAI({
        target,
        identityReferences,
        scenario,
        plan,
        selections,
        engine,
      });
      const merged = [
        ...results.filter((item) => !(item.stageId === stageId && item.angle === angle && (item.engine ?? "seedream") === engine)),
        next,
      ];
      setResults(merged);
      await saveLocal("simulations", merged);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "效果图没有生成，请重试");
    } finally {
      setLoadingKey("");
    }
  };

  if (!target) {
    return <div className="simulation-empty"><ImageOff size={28} /><strong>缺少本人照片</strong><span>补充正脸和侧脸后才能生成同角度预览。</span></div>;
  }

  return (
    <section className="ai-studio">
      <div className="ai-studio-heading">
        <div><span>AI VISUAL LAB</span><h2>按阶段看见真实方向</h2></div>
        <span className="ai-badge"><Sparkles size={14} /> {ENGINE_LABELS[engine].name}</span>
      </div>

      <div className="engine-switch" role="group" aria-label="选择视觉模型">
        {(Object.keys(ENGINE_LABELS) as SimulationEngine[]).map((item) => (
          <button type="button" key={item} className={engine === item ? "active" : ""} onClick={() => setEngine(item)}>
            <strong>{ENGINE_LABELS[item].name}</strong><small>{ENGINE_LABELS[item].note}</small>
          </button>
        ))}
      </div>

      <div className="scenario-tabs" role="tablist" aria-label="选择模拟阶段">
        {scenarios.map((item) => (
          <button type="button" role="tab" aria-selected={item.id === stageId} className={item.id === stageId ? "active" : ""} key={item.id} onClick={() => setStageId(item.id)}>
            <span>{item.label}</span><strong>{item.title}</strong>
          </button>
        ))}
      </div>

      <div className="scenario-brief">
        <p>{scenario.summary}</p>
        <div><span>本阶段改变</span>{scenario.changes.map((change) => <b key={change}>{change}</b>)}</div>
        <div className="unchanged"><span>明确不改</span>{scenario.unchanged.map((item) => <b key={item}>{item}</b>)}</div>
      </div>

      <div className="angle-switch" role="group" aria-label="选择照片角度">
        {angles.map((item) => <button type="button" key={item} className={angle === item ? "active" : ""} onClick={() => setAngle(item)}>{ANGLE_LABELS[item]}</button>)}
      </div>

      {afterUrl && (
        <div className="comparison-mode" role="group" aria-label="选择对比方式">
          <button type="button" className={compareMode === "side" ? "active" : ""} onClick={() => setCompareMode("side")}><Columns2 size={15} /> 前后对照</button>
          <button type="button" className={compareMode === "slider" ? "active" : ""} onClick={() => setCompareMode("slider")}><SlidersHorizontal size={15} /> 叠加查看</button>
        </div>
      )}

      {afterUrl && compareMode === "side" ? (
        <div className="ai-comparison-grid">
          <figure><div>{beforeUrl && <img src={beforeUrl} alt={`${ANGLE_LABELS[angle]}原始照片`} />}</div><figcaption><span>BEFORE</span><strong>原始</strong></figcaption></figure>
          <figure className="after"><div><img src={afterUrl} alt={`${ANGLE_LABELS[angle]}AI方向模拟`} /></div><figcaption><span>AFTER</span><strong>AI 方向模拟</strong></figcaption></figure>
        </div>
      ) : (
        <>
          <div className="ai-simulation-stage">
            {beforeUrl && <img src={beforeUrl} alt={`${ANGLE_LABELS[angle]}原始照片`} />}
            {afterUrl && (
              <div className="ai-simulation-after" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                <img src={afterUrl} alt={`${ANGLE_LABELS[angle]}AI方向模拟`} />
              </div>
            )}
            {afterUrl && <div className="compare-line" style={{ left: `${compare}%` }}><span /></div>}
            <span className="before-label">原始</span>
            {afterUrl && <span className="after-label">AI 方向模拟</span>}
            {isLoading && <div className="simulation-loading"><LoaderCircle size={23} className="spin" /><strong>{ENGINE_LABELS[engine].name} 正在局部编辑原图</strong><span>复杂照片可能需要约 1–2 分钟，请保持页面开启</span></div>}
          </div>
          {afterUrl && compareMode === "slider" && <input className="compare-slider" type="range" min="0" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="拖动比较原始照片和AI模拟" />}
        </>
      )}

      {isLoading && afterUrl && compareMode === "side" && <div className="simulation-loading standalone"><LoaderCircle size={23} className="spin" /><strong>{ENGINE_LABELS[engine].name} 正在局部编辑原图</strong><span>复杂照片可能需要约 1–2 分钟，请保持页面开启</span></div>}

      {error && <div className="ai-error"><CircleAlert size={17} /><span>{error}</span></div>}
      <button className="generate-image-button" type="button" onClick={() => void generate()} disabled={isLoading}>
        {isLoading ? <><LoaderCircle className="spin" size={18} /> 正在生成</> : result ? <><RefreshCcw size={18} /> 用 {ENGINE_LABELS[engine].name} 重新生成</> : <><Sparkles size={18} /> 用 {ENGINE_LABELS[engine].name} 生成 · {ANGLE_LABELS[angle]}</>}
      </button>

      <div className="simulation-disclosure">
        <ShieldCheck size={18} />
        <p><strong>原图不会被修改。</strong> 这是审美方向图，不是医学预测，也不代表某个材料或剂量一定达到的结果。生成图可能有轻微取景漂移，以“前后对照”为主。</p>
      </div>
    </section>
  );
}
