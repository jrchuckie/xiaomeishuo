import { CircleAlert, ImageOff, LoaderCircle, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { generateSimulationWithAI } from "../lib/ai";
import { loadLocal, saveLocal } from "../lib/storage";
import type { CaptureKind, FaceCapture, FeatureSelections, PersonalPlan, SimulationResult, VisualScenario } from "../types";

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
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loadingKey, setLoadingKey] = useState("");
  const [error, setError] = useState("");
  const [compare, setCompare] = useState(50);

  useEffect(() => {
    void loadLocal<SimulationResult[]>("simulations").then((stored) => {
      if (stored) setResults(stored);
    });
  }, []);

  const scenario = scenarios.find((item) => item.id === stageId) ?? scenarios[0];
  const target = captures.find((capture) => capture.kind === angle);
  const result = results.find((item) => item.stageId === stageId && item.angle === angle);
  const beforeUrl = useBlobUrl(target?.blob);
  const afterUrl = useBlobUrl(result?.image);
  const key = `${stageId}:${angle}`;
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
      });
      const merged = [...results.filter((item) => !(item.stageId === stageId && item.angle === angle)), next];
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
        <span className="ai-badge"><Sparkles size={14} /> Seedream 5.0 Pro 视觉模拟</span>
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
        {isLoading && <div className="simulation-loading"><LoaderCircle size={23} className="spin" /><strong>正在保持身份与原角度</strong><span>通常需要 20–60 秒，请不要关闭页面</span></div>}
      </div>
      {afterUrl && <input className="compare-slider" type="range" min="0" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="拖动比较原始照片和AI模拟" />}

      {error && <div className="ai-error"><CircleAlert size={17} /><span>{error}</span></div>}
      <button className="generate-image-button" type="button" onClick={() => void generate()} disabled={isLoading}>
        {isLoading ? <><LoaderCircle className="spin" size={18} /> 正在生成</> : result ? <><RefreshCcw size={18} /> 重新生成这一角度</> : <><Sparkles size={18} /> 生成这一阶段 · {ANGLE_LABELS[angle]}</>}
      </button>

      <div className="simulation-disclosure">
        <ShieldCheck size={18} />
        <p><strong>原图不会被修改。</strong> 这是基于审美方向的生成图，不是医学预测，也不能代表某个材料或剂量一定达到的结果。输出会保留“AI 生成”标识。</p>
      </div>
    </section>
  );
}
