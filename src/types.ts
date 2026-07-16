export type SourceImage = {
  id: string;
  name: string;
  blob: Blob;
  preview: string;
};

export type StyleScore = {
  key: string;
  label: string;
  score: number;
};

export type EvidenceTrust = "较可信" | "疑似合成" | "疑似重修" | "待人工核实";

export type AestheticEvidence = {
  sourceId: string;
  sourceName: string;
  thumbnail?: Blob;
  dominantStyle: string;
  trust: EvidenceTrust;
  trustScore: number;
  reason: string;
};

export type FeaturePreference = {
  key: "face" | "eyes" | "nose" | "lips" | "brows" | "skin" | "hair";
  label: string;
  choice: string;
  alternatives: string[];
  confidence: number;
  reason: string;
};

export type AestheticProfile = {
  styles: StyleScore[];
  evidence: AestheticEvidence[];
  features: FeaturePreference[];
  naturality: number;
  sharpness: number;
  warmth: number;
  confidence: "高" | "中" | "待校准";
  sourceCount: number;
  usableCount: number;
  localModel: boolean;
  generatedBy?: string;
  generatedAt?: string;
};

export type CaptureKind = "front" | "left" | "right";

export type FaceCapture = {
  kind: CaptureKind;
  name: string;
  blob: Blob;
  preview: string;
  quality?: PhotoQuality;
};

export type PhotoQuality = {
  usable: boolean;
  brightness: number;
  sharpness: number;
  faceCount: number;
  eyewear?: boolean;
  pose: "正脸" | "侧脸" | "角度不标准" | "未检测";
  messages: string[];
};

export type FaceProfile = {
  faceRatio?: number;
  jawRatio?: number;
  balance?: number;
  landmarks?: { x: number; y: number }[];
  summary: string[];
  captureReady: boolean;
};

export type UserPreferences = {
  budget: "3000以内" | "3000–10000" | "1–3万" | "3万以上";
  annualBudget: "5000以内" | "5000–2万" | "2–5万" | "5万以上";
  invasiveness: "不接受针剂" | "可接受针剂" | "可讨论手术";
  timeline: "1个月内" | "3个月内" | "半年内" | "先研究不行动";
  downtime: "不接受恢复期" | "可接受1–3天" | "可接受1–2周";
  riskTolerance: "非常保守" | "平衡效果与风险" | "效果优先";
  experience: "第一次研究" | "做过光电/皮肤项目" | "做过针剂" | "做过手术";
  decisionStage: "刚开始了解" | "已在比较项目" | "已拿到面诊方案" | "准备近期行动";
  motivation: "自己主动想改善" | "照片或镜头困扰" | "他人评价影响" | "医生建议后犹豫";
  priorities: string[];
  mustPreserve: string[];
  excluded: string[];
  medicalFlags: string[];
  personalGoal: string;
  currentConcerns: string;
  doctorProposal: string;
  treatmentHistory: TreatmentHistoryEntry[];
  cloudConsent: boolean;
};

export type TreatmentHistoryEntry = {
  id: string;
  category: "透明质酸/填充" | "肉毒毒素" | "再生材料" | "光电/皮肤" | "手术" | "其他";
  product: string;
  amount: string;
  areas: string;
  date: string;
  outcome: "满意" | "一般" | "不满意" | "仍在观察";
  adverseEvents: string;
  notes: string;
};

export type FeatureKey = "eyes" | "nose" | "contour" | "brows" | "lips" | "skin" | "hair";
export type FeatureSelections = Record<FeatureKey, string>;

export type MaterialOption = {
  name: string;
  category: "非医疗" | "光电" | "透明质酸" | "再生材料" | "肉毒毒素" | "手术咨询";
  area: string;
  amountOptions: string[];
  fit: string;
  evidence: "大陆已核验" | "需核验具体型号/适应证" | "非医疗服务";
  caveat: string;
  whyFit?: string;
  whyNot?: string;
  reversibility?: string;
};

export type PlanItem = {
  title: string;
  reason: string;
  action: string;
  timing: string;
  budget: string;
  risk: "低" | "中" | "需医生评估";
  area: string;
  materials?: MaterialOption[];
  priority?: "现在" | "观察后" | "可选" | "不建议";
  confidence?: "高" | "中" | "低";
  evidence?: string[];
  tradeoffs?: string[];
  notNow?: string;
  reassessAfter?: string;
  historyAdjustment?: string;
};

export type PlanObservation = {
  area: string;
  observation: string;
  evidence: string;
  implication: string;
  confidence: "高" | "中" | "低";
  limit: string;
};

export type AestheticSynthesis = {
  summary: string;
  styleKeywords: string[];
  featureSignals: Array<{
    area: string;
    preference: string;
    evidence: string;
    confidence: "高" | "中" | "低";
    preserve: string;
  }>;
  antiGoals: string[];
  referenceNotes: Array<{
    referenceIndex: number;
    decision: "采纳" | "谨慎采纳" | "排除";
    signal: string;
    reason: string;
  }>;
};

export type VisualScenario = {
  id: "stage-1" | "stage-2" | "stage-3";
  label: string;
  title: string;
  summary: string;
  changes: string[];
  unchanged: string[];
};

export type PersonalPlan = {
  headline: string;
  executiveSummary?: string;
  aestheticSynthesis?: AestheticSynthesis;
  aestheticGoal?: string;
  currentState?: string;
  historyImpact?: string[];
  observations?: PlanObservation[];
  unresolvedQuestions?: string[];
  decisionLogic?: string[];
  preserve: string[];
  avoid: string[];
  estimatedBudget: string;
  consultationQuestions: string[];
  phases: { label: string; title: string; items: PlanItem[] }[];
  visualScenarios?: VisualScenario[];
  generatedBy?: string;
  generatedAt?: string;
};

export type SimulationResult = {
  id: string;
  stageId: VisualScenario["id"];
  angle: CaptureKind;
  image: Blob;
  generatedAt: string;
  model: string;
  assumptions: string[];
};
