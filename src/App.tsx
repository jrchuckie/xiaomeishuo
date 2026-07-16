import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Images,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw,
  ScanFace,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import CameraCapture from "./components/CameraCapture";
import FaceSimulation from "./components/FaceSimulation";
import FeatureDirectionPicker from "./components/FeatureDirectionPicker";
import { analyzeAesthetic, STYLE_OPTIONS } from "./lib/aesthetic";
import { importBoardThroughAuthorizedAdapter, parseXhsBoardLink } from "./lib/board";
import { createFaceProfile, inspectFacePhoto } from "./lib/face";
import { optimizeImageFile, releasePreview } from "./lib/image";
import { generatePlan } from "./lib/planner";
import { clearLocalSession, loadLocal, removeLocal, saveLocal } from "./lib/storage";
import type {
  AestheticProfile,
  CaptureKind,
  FaceCapture,
  FaceProfile,
  FeatureKey,
  FeatureSelections,
  PersonalPlan,
  SourceImage,
  UserPreferences,
} from "./types";

type Screen = "source" | "profile" | "face" | "preferences" | "direction" | "plan";
type StoredImage = Omit<SourceImage, "preview">;
type StoredCapture = Omit<FaceCapture, "preview">;
type WorkflowProgress = {
  screen: Screen;
  calibration: string[];
  captureAttested: boolean;
  analyzing: boolean;
  updatedAt: number;
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const BOARD_STATUS_DEFAULT = "粘贴一个已分享的收藏夹链接";
const NAV_LABELS: Record<Screen, string> = {
  source: "理想样本",
  profile: "审美画像",
  face: "真实面部",
  preferences: "决策边界",
  direction: "方向沙盘",
  plan: "完整方案",
};
const PRIORITIES = ["肤质", "眉形", "眼睛", "鼻子", "嘴唇", "轮廓", "面颈线条", "发型"];
const PRESERVE_OPTIONS = ["原生肤色", "单眼皮/内双", "鼻部辨识度", "下颌线", "自然不对称", "痣与雀斑"];
const EXCLUDED_OPTIONS = ["美白", "填充/针剂", "光电项目", "手术", "纹绣"];
const MEDICAL_FLAG_OPTIONS = ["过敏史", "瘢痕或增生体质", "正在服用影响凝血的药物", "孕期或哺乳期", "皮肤炎症或爆痘", "既往项目有不良反应"];
const CAPTURES: { kind: CaptureKind; label: string; note: string; requirement: string }[] = [
  { kind: "front", label: "正脸", note: "平视镜头，头部不倾斜", requirement: "必拍" },
  { kind: "left", label: "左侧脸", note: "完整侧面，耳朵可见", requirement: "左右任选一张" },
  { kind: "right", label: "右侧脸", note: "完整侧面，耳朵可见", requirement: "左右任选一张" },
];

const DEFAULT_PREFERENCES: UserPreferences = {
  budget: "1–3万",
  annualBudget: "2–5万",
  invasiveness: "不接受针剂",
  timeline: "3个月内",
  downtime: "可接受1–3天",
  riskTolerance: "非常保守",
  experience: "第一次研究",
  decisionStage: "刚开始了解",
  motivation: "自己主动想改善",
  priorities: ["肤质", "眉形", "轮廓"],
  mustPreserve: ["原生肤色", "自然不对称"],
  excluded: [],
  medicalFlags: [],
};

const FEATURE_DIRECTIONS: { key: FeatureKey; label: string; options: string[]; note?: string }[] = [
  { key: "eyes", label: "眼睛", options: ["保留原生", "轻微放大", "拉长眼尾"] },
  { key: "nose", label: "鼻子", options: ["保留原生", "鼻尖精致", "直线鼻背"] },
  { key: "contour", label: "轮廓", options: ["保留原生", "收窄下颌", "下巴舒展"] },
  { key: "brows", label: "眉毛", options: ["保留原生", "清晰眉尾", "轻挑眉峰"] },
  { key: "lips", label: "嘴唇", options: ["保留原生", "边界清晰", "轻微丰润"] },
  { key: "skin", label: "肤色质感", options: ["保留原生", "均匀透亮", "健康暖调"] },
  { key: "hair", label: "发型", options: ["短发利落", "中长层次", "长发柔和"], note: "进入方案，不改变面部结构模拟" },
];

const DEFAULT_SELECTIONS: FeatureSelections = {
  eyes: "保留原生",
  nose: "保留原生",
  contour: "保留原生",
  brows: "清晰眉尾",
  lips: "保留原生",
  skin: "保留原生",
  hair: "短发利落",
};

function resumableScreen(
  requested: Screen | undefined,
  data: {
    profile?: AestheticProfile;
    faceProfile?: FaceProfile;
    preferences: UserPreferences;
    plan?: PersonalPlan;
  },
): Screen {
  const canOpen: Record<Screen, boolean> = {
    source: true,
    profile: Boolean(data.profile),
    face: Boolean(data.profile),
    preferences: Boolean(data.faceProfile?.captureReady),
    direction: Boolean(data.faceProfile?.captureReady && data.preferences.priorities.length),
    plan: Boolean(data.plan && data.profile && data.faceProfile?.captureReady),
  };
  if (requested && canOpen[requested]) return requested;
  if (canOpen.plan) return "plan";
  if (canOpen.direction) return "direction";
  if (canOpen.preferences) return "preferences";
  if (canOpen.profile) return "profile";
  return "source";
}

function selectionsFromProfile(profile: AestheticProfile): FeatureSelections {
  const byKey = Object.fromEntries(profile.features.map((feature) => [feature.key, feature.choice]));
  return {
    eyes: String(byKey.eyes).includes("细长") ? "拉长眼尾" : String(byKey.eyes).includes("圆润") ? "轻微放大" : "保留原生",
    nose: String(byKey.nose).includes("鼻尖") ? "鼻尖精致" : String(byKey.nose).includes("直线") ? "直线鼻背" : "保留原生",
    contour: String(byKey.face).includes("利落") ? "收窄下颌" : String(byKey.face).includes("柔和") ? "保留原生" : "保留原生",
    brows: String(byKey.brows).includes("眉峰") ? "轻挑眉峰" : String(byKey.brows).includes("清晰") ? "清晰眉尾" : "保留原生",
    lips: String(byKey.lips).includes("饱满") ? "轻微丰润" : String(byKey.lips).includes("弧线") ? "边界清晰" : "保留原生",
    skin: String(byKey.skin).includes("暖调") ? "健康暖调" : String(byKey.skin).includes("透亮") ? "均匀透亮" : "保留原生",
    hair: String(byKey.hair).includes("长发") ? "长发柔和" : String(byKey.hair).includes("中长") ? "中长层次" : "短发利落",
  };
}

function App() {
  const [screen, setScreen] = useState<Screen>("source");
  const [boardUrl, setBoardUrl] = useState("");
  const [boardStatus, setBoardStatus] = useState(BOARD_STATUS_DEFAULT);
  const [boardTone, setBoardTone] = useState<"idle" | "ok" | "warn">("idle");
  const [references, setReferences] = useState<SourceImage[]>([]);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [calibration, setCalibration] = useState<string[]>(["natural"]);
  const [profile, setProfile] = useState<AestheticProfile>();
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [preparingReferences, setPreparingReferences] = useState(false);
  const [captures, setCaptures] = useState<FaceCapture[]>([]);
  const capturesRef = useRef<FaceCapture[]>([]);
  const [inspectingCaptures, setInspectingCaptures] = useState<CaptureKind[]>([]);
  const frontLandmarksRef = useRef<{ x: number; y: number }[] | undefined>(undefined);
  const [faceProfile, setFaceProfile] = useState<FaceProfile>();
  const [captureMessage, setCaptureMessage] = useState("");
  const [captureAttested, setCaptureAttested] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [selections, setSelections] = useState<FeatureSelections>(DEFAULT_SELECTIONS);
  const [plan, setPlan] = useState<PersonalPlan>();
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [showInstall, setShowInstall] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const progressSnapshot = (nextScreen = screen, isAnalyzing = analyzing): WorkflowProgress => ({
    screen: nextScreen,
    calibration,
    captureAttested,
    analyzing: isAnalyzing,
    updatedAt: Date.now(),
  });

  const goToScreen = (nextScreen: Screen) => {
    setScreen(nextScreen);
    void saveLocal("progress", progressSnapshot(nextScreen, false));
  };

  useEffect(() => {
    const restore = async () => {
      try {
        const [storedReferences, storedCaptures, storedProfile, storedFaceProfile, storedPreferences, storedSelections, storedPlan, storedProgress] = await Promise.all([
          loadLocal<StoredImage[]>("references"),
          loadLocal<StoredCapture[]>("faces"),
          loadLocal<AestheticProfile>("profile"),
          loadLocal<FaceProfile>("faceProfile"),
          loadLocal<UserPreferences>("preferences"),
          loadLocal<FeatureSelections>("selections"),
          loadLocal<PersonalPlan>("plan"),
          loadLocal<WorkflowProgress>("progress"),
        ]);
        const restoredPreferences = storedPreferences ? { ...DEFAULT_PREFERENCES, ...storedPreferences } : DEFAULT_PREFERENCES;
        const restoredCaptures = storedCaptures?.map((capture) => ({ ...capture, preview: URL.createObjectURL(capture.blob) })) ?? [];
        const refreshedFaceProfile = storedFaceProfile || restoredCaptures.length
          ? createFaceProfile(restoredCaptures, storedFaceProfile?.landmarks)
          : undefined;
        const restoredPlan = storedPlan && storedProfile && refreshedFaceProfile?.captureReady ? storedPlan : undefined;
        if (storedReferences) {
          setReferences(storedReferences.map((image) => ({ ...image, preview: URL.createObjectURL(image.blob) })));
        }
        setCaptures(restoredCaptures);
        capturesRef.current = restoredCaptures;
        if (storedProfile) setProfile(storedProfile);
        if (refreshedFaceProfile) {
          setFaceProfile(refreshedFaceProfile);
          frontLandmarksRef.current = refreshedFaceProfile.landmarks;
          void saveLocal("faceProfile", refreshedFaceProfile);
        }
        setPreferences(restoredPreferences);
        if (storedSelections) setSelections(storedSelections);
        if (restoredPlan) setPlan(restoredPlan);
        if (storedProgress?.calibration?.length) setCalibration(storedProgress.calibration);
        if (storedProgress?.captureAttested) setCaptureAttested(true);
        setScreen(resumableScreen(storedProgress?.screen, {
          profile: storedProfile,
          faceProfile: refreshedFaceProfile,
          preferences: restoredPreferences,
          plan: restoredPlan,
        }));
        if (storedProgress?.analyzing && !storedProfile && storedReferences?.length) {
          setAnalysisMessage("上次分析被手机中断，已恢复全部图片。点击下方按钮即可继续。");
        }
      } catch {
        setAnalysisMessage("本地档案恢复失败，请重新打开一次；已上传图片不会发送到服务器。");
      } finally {
        setHydrated(true);
      }
    };
    void restore();

    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveLocal("progress", progressSnapshot());
  }, [screen, calibration, captureAttested, analyzing, hydrated]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  const completed = useMemo(() => ({
    source: references.length >= 3,
    profile: Boolean(profile),
    face: Boolean(faceProfile?.captureReady),
    preferences: Boolean(faceProfile?.captureReady && preferences.priorities.length),
    direction: Boolean(plan),
    plan: Boolean(plan),
  }), [references.length, profile, faceProfile, preferences.priorities.length, plan]);

  const available = useMemo(() => ({
    source: true,
    profile: Boolean(profile),
    face: Boolean(profile),
    preferences: Boolean(faceProfile?.captureReady),
    direction: Boolean(faceProfile?.captureReady && preferences.priorities.length),
    plan: Boolean(plan),
  }), [profile, faceProfile, preferences.priorities.length, plan]);

  const faceMinimum = useMemo(() => ({
    hasFront: captures.some((capture) => capture.kind === "front"),
    hasSide: captures.some((capture) => capture.kind === "left" || capture.kind === "right"),
  }), [captures]);

  const addReferences = async (files: FileList | null) => {
    if (!files?.length) return;
    const remainingSlots = Math.max(0, 24 - references.length);
    if (remainingSlots === 0) {
      setAnalysisMessage("当前已达到 24 张上限；删除不需要的样本后可以继续添加。");
      return;
    }
    const imageExtension = /\.(?:avif|hei[cf]|jpe?g|png|webp)$/i;
    const selectedFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/") || imageExtension.test(file.name))
      .slice(0, remainingSlots);
    if (!selectedFiles.length) {
      setAnalysisMessage("没有识别到可用图片，请选择 JPG、PNG、HEIC、AVIF 或 WebP 文件。");
      return;
    }

    setPreparingReferences(true);
    setAnalysisMessage(`正在优化并保存 0 / ${selectedFiles.length} 张图片`);
    setProfile(undefined);
    setPlan(undefined);
    await Promise.all([removeLocal("profile"), removeLocal("plan")]);
    let next = [...references];
    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = await optimizeImageFile(selectedFiles[index], 1440, 0.86);
        next = [...next, { id: crypto.randomUUID(), name: file.name, blob: file, preview: URL.createObjectURL(file) }];
        setReferences(next);
        await saveLocal<StoredImage[]>("references", next.map(({ preview: _preview, ...image }) => image));
        setAnalysisMessage(`正在优化并保存 ${index + 1} / ${selectedFiles.length} 张图片`);
      }
      setAnalysisMessage(`已在本机安全保存 ${next.length} 张图片`);
    } catch {
      setAnalysisMessage("部分图片处理失败，已保存成功导入的图片，可继续添加。");
    } finally {
      setPreparingReferences(false);
    }
  };

  const removeReference = async (id: string) => {
    releasePreview(references.find((image) => image.id === id)?.preview);
    const next = references.filter((image) => image.id !== id);
    setReferences(next);
    setProfile(undefined);
    setPlan(undefined);
    await Promise.all([
      saveLocal<StoredImage[]>("references", next.map(({ preview: _preview, ...image }) => image)),
      removeLocal("profile"),
      removeLocal("plan"),
    ]);
  };

  const validateBoard = async () => {
    const parsed = parseXhsBoardLink(boardUrl);
    if (!parsed.valid) {
      setBoardTone("warn");
      setBoardStatus(parsed.message);
      return;
    }
    setBoardTone("ok");
    setBoardStatus("链接有效，正在检查授权导入能力");
    try {
      const items = await importBoardThroughAuthorizedAdapter(boardUrl);
      setBoardStatus(`已从授权接口读取 ${items.length} 条收藏`);
    } catch (error) {
      if (error instanceof Error && error.message === "NO_AUTHORIZED_ADAPTER") {
        setBoardStatus("链接已识别；当前原型未接入小红书内部授权，请从分享页选择图片导入");
      } else {
        setBoardStatus("授权接口暂不可用，请改用图片导入");
      }
    }
  };

  const analyzeReferences = async (images: SourceImage[], navigate = true) => {
    if (images.length < 3) {
      setAnalysisMessage("至少需要 3 张参考图；建议 12–20 张");
      return;
    }
    setAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisMessage("正在准备本地分析");
    await saveLocal("progress", progressSnapshot(screen, true));
    try {
      const result = await analyzeAesthetic(images, calibration, (message, progress) => {
        setAnalysisMessage(message);
        if (progress !== undefined) setAnalysisProgress(progress);
      });
      setProfile(result);
      const nextSelections = selectionsFromProfile(result);
      setSelections(nextSelections);
      setPlan(undefined);
      const nextScreen = navigate ? "profile" : screen;
      await Promise.all([
        saveLocal("profile", result),
        saveLocal("selections", nextSelections),
        saveLocal("progress", progressSnapshot(nextScreen, false)),
      ]);
      if (navigate) setScreen("profile");
    } catch {
      setAnalysisMessage("本地分析没有完成。图片和当前进度已保存，可以再次尝试。");
      await saveLocal("progress", progressSnapshot(screen, false));
    } finally {
      setAnalyzing(false);
    }
  };

  const runAnalysis = () => analyzeReferences(references);

  const excludeEvidence = async (id: string) => {
    const next = references.filter((image) => image.id !== id);
    setReferences(next);
    await saveLocal<StoredImage[]>("references", next.map(({ preview: _preview, ...image }) => image));
    await analyzeReferences(next, false);
  };

  const setCapture = async (kind: CaptureKind, file?: File) => {
    if (!file) return;
    setCaptureMessage("");
    setCaptureAttested(false);
    setInspectingCaptures((current) => current.includes(kind) ? current : [...current, kind]);
    try {
      const prepared = await optimizeImageFile(file, 1600, 0.9);
      releasePreview(capturesRef.current.find((capture) => capture.kind === kind)?.preview);
      const preview = URL.createObjectURL(prepared);
      const base: FaceCapture = { kind, name: prepared.name, blob: prepared, preview };
      const nextBase = [...capturesRef.current.filter((capture) => capture.kind !== kind), base];
      capturesRef.current = nextBase;
      setCaptures(nextBase);
      const draftProfile = createFaceProfile(nextBase, frontLandmarksRef.current);
      setFaceProfile(draftProfile);
      setPlan(undefined);
      await Promise.all([
        saveLocal<StoredCapture[]>("faces", nextBase.map(({ preview: _preview, ...capture }) => capture)),
        saveLocal("faceProfile", draftProfile),
        removeLocal("plan"),
      ]);

      let inspected: Awaited<ReturnType<typeof inspectFacePhoto>>;
      try {
        inspected = await inspectFacePhoto(prepared, kind);
      } catch {
        inspected = {
          quality: {
            usable: false,
            brightness: 0,
            sharpness: 0,
            faceCount: 0,
            pose: "未检测",
            messages: ["自动检查暂未完成；不影响继续，正式建议前请按拍摄标准复核"],
          },
        };
      }

      const currentCapture = capturesRef.current.find((capture) => capture.kind === kind);
      if (currentCapture?.blob !== prepared) return;
      if (kind === "front" && inspected.landmarks) {
        frontLandmarksRef.current = inspected.landmarks;
      }
      const next = capturesRef.current.map((capture) => capture.kind === kind ? { ...capture, quality: inspected.quality } : capture);
      capturesRef.current = next;
      setCaptures(next);
      const nextProfile = createFaceProfile(next, frontLandmarksRef.current);
      setFaceProfile(nextProfile);
      await Promise.all([
        saveLocal<StoredCapture[]>("faces", next.map(({ preview: _preview, ...capture }) => capture)),
        saveLocal("faceProfile", nextProfile),
      ]);
    } catch {
      setCaptureMessage("这张照片没有成功保存，请换一张或重新拍摄。");
    } finally {
      setInspectingCaptures((current) => current.filter((item) => item !== kind));
    }
  };

  const finishFace = () => {
    const nextProfile = createFaceProfile(capturesRef.current, frontLandmarksRef.current);
    setFaceProfile(nextProfile);
    void saveLocal("faceProfile", nextProfile);
    if (!nextProfile.captureReady) return;
    goToScreen("preferences");
  };

  const finishPreferences = async () => {
    await saveLocal("preferences", preferences);
    setPlan(undefined);
    goToScreen("direction");
  };

  const finishDirection = async () => {
    await saveLocal("selections", selections);
    if (!profile || !faceProfile) return;
    const nextPlan = generatePlan(profile, faceProfile, preferences, selections);
    setPlan(nextPlan);
    await saveLocal("plan", nextPlan);
    goToScreen("plan");
  };

  const resetAll = async () => {
    await clearLocalSession();
    references.forEach((image) => releasePreview(image.preview));
    captures.forEach((capture) => releasePreview(capture.preview));
    setReferences([]);
    setCaptures([]);
    capturesRef.current = [];
    frontLandmarksRef.current = undefined;
    setProfile(undefined);
    setFaceProfile(undefined);
    setCaptureMessage("");
    setCaptureAttested(false);
    setPreferences(DEFAULT_PREFERENCES);
    setSelections(DEFAULT_SELECTIONS);
    setPlan(undefined);
    setAnalysisMessage("");
    setScreen("source");
  };

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") setShowInstall(false);
      return;
    }
    setShowInstall(true);
  };

  if (!hydrated) {
    return <div className="boot"><LoaderCircle className="spin" /><span>正在打开你的本地档案</span></div>;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" onClick={() => goToScreen("source")} aria-label="返回首页">
          <span className="brand-mark"><i /><i /></span>
          <span>小美说</span>
        </button>
        <div className="header-actions">
          <span className="local-badge"><LockKeyhole size={13} /> 本地档案</span>
          <button className="icon-button" type="button" onClick={install} aria-label="安装 App" title="安装 App"><Download size={20} /></button>
        </div>
      </header>

      <main className="app-main">
        {screen === "source" && (
          <section className="screen source-screen">
            <div className="screen-heading">
              <span className="step-label">STEP 1 · 理想样本</span>
              <h1>先让我看懂，<br />你真正喜欢什么</h1>
              <p>导入小红书收藏、风格图或案例图。图片在你的设备上分析，默认不上传。</p>
            </div>

            <div className="board-import panel">
              <div className="panel-title"><Link2 size={19} /><strong>导入小红书收藏夹</strong></div>
              <div className="url-row">
                <input value={boardUrl} onChange={(event) => setBoardUrl(event.target.value)} placeholder="粘贴收藏夹分享链接" inputMode="url" />
                <button type="button" onClick={validateBoard}>验证</button>
              </div>
              <div className={`board-status ${boardTone}`}>
                {boardTone === "ok" ? <Check size={16} /> : boardTone === "warn" ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}
                <span>{boardStatus}</span>
              </div>
              {boardTone === "ok" && boardUrl && (
                <a className="text-link" href={boardUrl} target="_blank" rel="noreferrer">在小红书打开收藏夹 <ExternalLink size={14} /></a>
              )}
            </div>

            <div className="upload-zone">
              <input
                ref={referenceInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif"
                multiple
                disabled={preparingReferences || analyzing}
                onChange={(event) => {
                  void addReferences(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <span className="upload-icon"><Images size={28} /></span>
              <strong>从相册选择收藏图或截图</strong>
              <span>一次可批量选择，建议 12–20 张，最多 24 张</span>
              <button className="upload-action" type="button" disabled={preparingReferences || analyzing} onClick={() => referenceInputRef.current?.click()}>
                <Upload size={15} /> 批量选择图片
              </button>
            </div>

            {references.length > 0 && (
              <div className="reference-section">
                <div className="section-row"><strong>已导入 {references.length} 张</strong><span>{references.length >= 12 ? "样本量良好" : "继续添加会更准确"}</span></div>
                <div className="reference-grid">
                  {references.map((image) => (
                    <figure key={image.id}>
                      <img src={image.preview} alt="审美参考" />
                      <button type="button" onClick={() => removeReference(image.id)} aria-label="删除图片"><Trash2 size={15} /></button>
                    </figure>
                  ))}
                </div>
              </div>
            )}

            <div className="calibration">
              <div className="section-row"><strong>先告诉我几个直觉</strong><span>可多选</span></div>
              <div className="chip-row">
                {STYLE_OPTIONS.map((style) => (
                  <button
                    type="button"
                    key={style.key}
                    className={calibration.includes(style.key) ? "chip selected" : "chip"}
                    onClick={() => setCalibration((current) => current.includes(style.key) ? current.filter((key) => key !== style.key) : [...current, style.key])}
                  >{style.label}</button>
                ))}
              </div>
            </div>

            {analyzing && <div className="analysis-progress"><div style={{ width: `${analysisProgress * 100}%` }} /><span>{analysisMessage}</span></div>}
            {!analyzing && analysisMessage && <p className="inline-message">{analysisMessage}</p>}
            <button className="primary-button" type="button" onClick={runAnalysis} disabled={preparingReferences || analyzing || references.length < 3}>
              {preparingReferences ? <><LoaderCircle size={19} className="spin" /> 正在安全保存图片</> : analyzing ? <><LoaderCircle size={19} className="spin" /> 正在学习你的审美</> : <>生成我的审美画像 <ArrowRight size={19} /></>}
            </button>
          </section>
        )}

        {screen === "profile" && profile && (
          <section className="screen profile-screen">
            <BackButton onClick={() => goToScreen("source")} />
            <div className="screen-heading compact">
              <span className="step-label">STEP 2 · 审美画像</span>
              <h1>每个判断，<br />都回到你的样本</h1>
              <p>本次检查 {profile.sourceCount} 张参考图，其中 {profile.usableCount} 张纳入画像。系统会提醒合成与重修风险，你可以排除后重算。</p>
            </div>

            <div className="profile-hero">
              <span className="profile-index">IDEAL ME / 01</span>
              <h2>{profile.styles.slice(0, 3).map((style) => style.label).join(" · ")}</h2>
              <p>这不是主流审美评分，而是你长期选择中重复出现的气质、五官、肤色和造型线索。</p>
              <span className="model-badge">{profile.localModel ? "设备端视觉模型" : "轻量分析 + 你的校准"}</span>
            </div>

            <div className="evidence-heading">
              <div><span>你的样本证据</span><strong>{profile.evidence.filter((item) => item.trust !== "较可信").length} 张建议复核</strong></div>
              <p>模型只做风险提醒，不做真假鉴定。合成或重修风险较高的样本默认不进入画像。</p>
            </div>
            <div className="evidence-scroll">
              {profile.evidence.map((evidence) => {
                const source = references.find((image) => image.id === evidence.sourceId);
                const suspect = evidence.trust === "疑似合成" || evidence.trust === "疑似重修";
                const neutral = evidence.trust === "待人工核实";
                return (
                  <article className="evidence-card" key={evidence.sourceId}>
                    {source ? <img src={source.preview} alt={evidence.dominantStyle} /> : <div className="missing-evidence"><Images size={22} /></div>}
                    <span className={`trust-badge ${suspect ? "suspect" : neutral ? "neutral" : "trusted"}`}>{evidence.trust}</span>
                    <div><strong>{evidence.dominantStyle}</strong><p>{evidence.reason}</p></div>
                    <button type="button" onClick={() => excludeEvidence(evidence.sourceId)} disabled={analyzing}><Trash2 size={14} /> {suspect ? "排除并重算" : "不纳入画像"}</button>
                  </article>
                );
              })}
            </div>
            {analyzing && <div className="profile-reanalysis"><LoaderCircle size={16} className="spin" /><span>{analysisMessage}</span></div>}

            <div className="style-chart panel">
              <div className="panel-title"><Sparkles size={19} /><strong>审美聚类</strong></div>
              {profile.styles.map((style) => (
                <div className="chart-row" key={style.key}>
                  <span>{style.label}</span>
                  <div><i style={{ width: `${Math.max(8, style.score * 100)}%` }} /></div>
                  <b>{Math.round(style.score * 100)}%</b>
                </div>
              ))}
            </div>

            <div className="axis-grid">
              <Axis label="原生感" value={profile.naturality} opposite="精修感" />
              <Axis label="柔和" value={100 - profile.sharpness} opposite="利落" />
              <Axis label="冷调" value={100 - profile.warmth} opposite="暖调" />
            </div>

            <div className="feature-profile">
              <div className="section-row"><strong>具体喜欢什么</strong><span>从脸型到发型</span></div>
              {profile.features.map((feature) => (
                <article key={feature.key}>
                  <div className="feature-index"><span>{feature.label}</span><b>{Math.round(feature.confidence * 100)}%</b></div>
                  <h3>{feature.choice}</h3>
                  <p>{feature.reason}</p>
                  {feature.alternatives.length > 0 && <small>次要倾向：{feature.alternatives.join(" / ")}</small>}
                </article>
              ))}
            </div>

            <button className="primary-button" type="button" onClick={() => goToScreen("face")}>建立我的真实面部基线 <ScanFace size={19} /></button>
          </section>
        )}

        {screen === "face" && (
          <section className="screen face-screen">
            <BackButton onClick={() => goToScreen(profile ? "profile" : "source")} />
            <div className="screen-heading compact">
              <span className="step-label">STEP 3 · 真实面部</span>
              <h1>关掉美颜，<br />先看清真实起点</h1>
              <p>至少提供一张正脸和任一侧脸；左右侧都补充会更准确。照片质量检查只做提示，不会阻断本次体验。</p>
            </div>

            <div className="capture-guide">
              <div><ShieldCheck size={19} /><span>无美颜</span></div>
              <div><Camera size={19} /><span>后置 1×</span></div>
              <div><ScanFace size={19} /><span>摘掉眼镜</span></div>
            </div>

            <div className="capture-stack">
              {CAPTURES.map((slot) => {
                const capture = captures.find((item) => item.kind === slot.kind);
                const inspecting = inspectingCaptures.includes(slot.kind);
                return (
                  <article className={`capture-card ${capture ? "captured" : ""} ${capture?.quality?.usable ? "ready" : ""}`} key={slot.kind}>
                    {capture ? <img src={capture.preview} alt={slot.label} /> : <div className="capture-placeholder"><Camera size={25} /></div>}
                    <div className="capture-copy">
                      <div className="capture-title"><strong>{slot.label}</strong><b>{slot.requirement}</b><span>{slot.note}</span></div>
                      {inspecting ? (
                        <div className="quality checking"><LoaderCircle size={15} className="spin" /><span>{capture ? "后台检查中，不影响继续" : "正在保存照片"}</span></div>
                      ) : capture?.quality ? (
                        <div className={capture.quality.usable ? "quality ok" : "quality warn"}>
                          {capture.quality.usable ? <Check size={15} /> : <CircleAlert size={15} />}
                          <span>{capture.quality.usable ? "照片质量良好" : capture.quality.messages[0] ?? "建议重拍；本次仍可继续"}</span>
                        </div>
                      ) : capture ? (
                        <div className="quality saved"><Check size={15} /><span>照片已保存，自动检查待完成</span></div>
                      ) : <ChevronRight size={20} />}
                      <div className="capture-actions">
                        <CameraCapture kind={slot.kind} label={slot.label} onCapture={(file) => void setCapture(slot.kind, file)} />
                        <label className="library-upload">
                          <input type="file" accept="image/*,.heic,.heif,.avif" onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            void setCapture(slot.kind, file);
                          }} />
                          <Upload size={15} /> 相册
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={`capture-minimum ${faceMinimum.hasFront && faceMinimum.hasSide ? "ok" : "pending"}`}>
              {faceMinimum.hasFront && faceMinimum.hasSide ? <Check size={17} /> : <CircleAlert size={17} />}
              <span>{faceMinimum.hasFront && faceMinimum.hasSide
                ? "正脸与侧脸已齐，可以继续；自动检查会在后台完成。"
                : `还需要${!faceMinimum.hasFront ? "一张正脸" : ""}${!faceMinimum.hasFront && !faceMinimum.hasSide ? "和" : ""}${!faceMinimum.hasSide ? "任一侧脸" : ""}。`}</span>
            </div>
            {captureMessage && <p className="inline-message">{captureMessage}</p>}

            <label className="capture-attestation">
              <input type="checkbox" checked={captureAttested} onChange={(event) => setCaptureAttested(event.target.checked)} />
              <span><strong>我确认这组照片来自原相机</strong><small>无美颜、无修图、已摘眼镜，拍摄于自然光下</small></span>
            </label>

            {faceProfile && (
              <div className={`capture-summary ${faceProfile.captureReady ? "ok" : "warn"}`}>
                <strong>{faceProfile.captureReady ? "面部基线可用" : "还差一张必要照片"}</strong>
                {faceProfile.summary.map((line) => <span key={line}>{line}</span>)}
              </div>
            )}

            <button className="primary-button" type="button" onClick={finishFace} disabled={!faceProfile?.captureReady || !captureAttested}>设置预算与边界 <SlidersHorizontal size={19} /></button>
          </section>
        )}

        {screen === "preferences" && (
          <section className="screen preferences-screen">
            <BackButton onClick={() => goToScreen("face")} />
            <div className="screen-heading compact">
              <span className="step-label">STEP 4 · 决策边界</span>
              <h1>先说清楚，<br />什么你愿意、什么不愿意</h1>
              <p>预算、行动时间、恢复期、风险偏好和必须保留的特征都会改变方案排序。</p>
            </div>

            <div className="survey-section">
              <span className="survey-number">01 · 预算与时间</span>
              <ChoiceGroup title="单次预算上限" options={["3000以内", "3000–10000", "1–3万", "3万以上"]} value={preferences.budget} onChange={(budget) => setPreferences({ ...preferences, budget: budget as UserPreferences["budget"] })} />
              <ChoiceGroup title="全年变美预算" options={["5000以内", "5000–2万", "2–5万", "5万以上"]} value={preferences.annualBudget} onChange={(annualBudget) => setPreferences({ ...preferences, annualBudget: annualBudget as UserPreferences["annualBudget"] })} />
              <ChoiceGroup title="希望什么时候开始" options={["1个月内", "3个月内", "半年内", "先研究不行动"]} value={preferences.timeline} onChange={(timeline) => setPreferences({ ...preferences, timeline: timeline as UserPreferences["timeline"] })} />
            </div>

            <div className="survey-section">
              <span className="survey-number">02 · 身体与风险边界</span>
              <ChoiceGroup title="可接受的侵入性" options={["不接受针剂", "可接受针剂", "可讨论手术"]} value={preferences.invasiveness} onChange={(invasiveness) => setPreferences({ ...preferences, invasiveness: invasiveness as UserPreferences["invasiveness"] })} />
              <ChoiceGroup title="可接受的恢复期" options={["不接受恢复期", "可接受1–3天", "可接受1–2周"]} value={preferences.downtime} onChange={(downtime) => setPreferences({ ...preferences, downtime: downtime as UserPreferences["downtime"] })} />
              <ChoiceGroup title="风险与效果怎么平衡" options={["非常保守", "平衡效果与风险", "效果优先"]} value={preferences.riskTolerance} onChange={(riskTolerance) => setPreferences({ ...preferences, riskTolerance: riskTolerance as UserPreferences["riskTolerance"] })} />
              <MultiChoice title="需要医生重点核对的信息" options={MEDICAL_FLAG_OPTIONS} values={preferences.medicalFlags} onChange={(medicalFlags) => setPreferences({ ...preferences, medicalFlags })} />
              <p className="survey-help">留空不代表没有风险；最终仍需由合规医生完成病史与禁忌证筛查。</p>
            </div>

            <div className="survey-section">
              <span className="survey-number">03 · 经验与决策状态</span>
              <ChoiceGroup title="你过去做过什么" options={["第一次研究", "做过光电/皮肤项目", "做过针剂", "做过手术"]} value={preferences.experience} onChange={(experience) => setPreferences({ ...preferences, experience: experience as UserPreferences["experience"] })} />
              <ChoiceGroup title="你现在走到哪一步" options={["刚开始了解", "已在比较项目", "已拿到面诊方案", "准备近期行动"]} value={preferences.decisionStage} onChange={(decisionStage) => setPreferences({ ...preferences, decisionStage: decisionStage as UserPreferences["decisionStage"] })} />
              <ChoiceGroup title="为什么现在想改变" options={["自己主动想改善", "照片或镜头困扰", "他人评价影响", "医生建议后犹豫"]} value={preferences.motivation} onChange={(motivation) => setPreferences({ ...preferences, motivation: motivation as UserPreferences["motivation"] })} />
            </div>

            <div className="survey-section">
              <span className="survey-number">04 · 优先级与保留项</span>
              <div className="choice-group">
              <strong>最想优先改善什么？最多选 3 项并自动排序</strong>
              <div className="choice-grid priorities">
                {PRIORITIES.map((priority) => {
                  const order = preferences.priorities.indexOf(priority);
                  const selected = order >= 0;
                  return (
                  <button
                    type="button"
                    className={selected ? "choice selected" : "choice"}
                    key={priority}
                    disabled={!selected && preferences.priorities.length >= 3}
                    onClick={() => setPreferences({
                      ...preferences,
                      priorities: selected ? preferences.priorities.filter((item) => item !== priority) : [...preferences.priorities, priority],
                    })}
                  >{selected && <b className="order-badge">{order + 1}</b>}{priority}</button>
                )})}
              </div>
            </div>

              <MultiChoice title="无论如何都想保留" options={PRESERVE_OPTIONS} values={preferences.mustPreserve} onChange={(mustPreserve) => setPreferences({ ...preferences, mustPreserve })} />
              <MultiChoice title="明确不接受" options={EXCLUDED_OPTIONS} values={preferences.excluded} onChange={(excluded) => setPreferences({ ...preferences, excluded })} danger />
            </div>

            <div className="safety-note"><ShieldCheck size={20} /><p><strong>建议不会越过你的边界</strong><br />不接受针剂时，方案不会用“效果最好”为理由偷偷加入针剂。</p></div>
            <button className="primary-button" type="button" onClick={finishPreferences} disabled={!profile || !faceProfile || preferences.priorities.length === 0}>进入本人效果沙盘 <Sparkles size={19} /></button>
          </section>
        )}

        {screen === "direction" && (
          <section className="screen direction-screen">
            <BackButton onClick={() => goToScreen("preferences")} />
            <div className="screen-heading compact">
              <span className="step-label">STEP 5 · 方向沙盘</span>
              <h1>别给我一个答案，<br />让我亲自比较</h1>
              <p>先切换五官、眉形、肤色和发型方向，再生成对应的分阶段方案。</p>
            </div>

            <FaceSimulation source={captures.find((capture) => capture.kind === "front")?.blob} landmarks={faceProfile?.landmarks} selections={selections} />

            <div className="direction-list">
              {FEATURE_DIRECTIONS.map((feature) => (
                <FeatureDirectionPicker
                  key={feature.key}
                  feature={feature}
                  sourceUrl={captures.find((capture) => capture.kind === "front")?.preview}
                  landmarks={faceProfile?.landmarks}
                  selections={selections}
                  onSelect={(option) => {
                    setSelections({ ...selections, [feature.key]: option });
                    setPlan(undefined);
                  }}
                />
              ))}
            </div>

            <div className="medical-boundary"><CircleAlert size={20} /><p><strong>先看方向，不把模拟当承诺。</strong><br />局部预览用来比较“想不想要”，材料和剂量效果将在方案中以区间和不确定性呈现。</p></div>
            <button className="primary-button" type="button" onClick={finishDirection}>按这个方向生成完整方案 <ArrowRight size={19} /></button>
          </section>
        )}

        {screen === "plan" && plan && (
          <section className="screen plan-screen">
            <BackButton onClick={() => goToScreen("direction")} />
            <div className="plan-title">
              <span>STEP 6 · MY IDEAL ME PLAN</span>
              <h1>{plan.headline}</h1>
              <p>{plan.estimatedBudget}</p>
            </div>

            <FaceSimulation source={captures.find((capture) => capture.kind === "front")?.blob} landmarks={faceProfile?.landmarks} selections={selections} />

            <div className="preserve-grid">
              <div><span>必须保留</span>{plan.preserve.map((item) => <strong key={item}>{item}</strong>)}</div>
              <div><span>明确避免</span>{plan.avoid.map((item) => <strong key={item}>{item}</strong>)}</div>
            </div>

            <div className="phase-list">
              {plan.phases.map((phase) => (
                <section className="phase" key={phase.label}>
                  <div className="phase-heading"><span>{phase.label}</span><h2>{phase.title}</h2></div>
                  {phase.items.map((planItem) => (
                    <article className="plan-item" key={planItem.title}>
                      <div className="plan-item-top"><h3>{planItem.title}</h3><span className={`risk ${planItem.risk === "低" ? "low" : "review"}`}>{planItem.risk}</span></div>
                      <span className="plan-area">{planItem.area}</span>
                      <p>{planItem.reason}</p>
                      <div className="action-line"><ArrowRight size={16} /><strong>{planItem.action}</strong></div>
                      <div className="meta-row"><span>{planItem.timing}</span><span>{planItem.budget}</span></div>
                      {planItem.materials && planItem.materials.length > 0 && (
                        <div className="material-list">
                          {planItem.materials.map((materialOption) => (
                            <article className="material-card" key={materialOption.name}>
                              <div className="material-top"><span>{materialOption.category}</span><b>{materialOption.evidence}</b></div>
                              <h4>{materialOption.name}</h4>
                              <p><strong>作用区域</strong>{materialOption.area}</p>
                              <div className="dose-options">
                                {materialOption.amountOptions.map((amount) => <span key={amount}>{amount}</span>)}
                              </div>
                              <p><strong>为什么进入候选</strong>{materialOption.fit}</p>
                              <small>{materialOption.caveat}</small>
                            </article>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              ))}
            </div>

            <div className="consultation-list">
              <span>带去面诊的四个问题</span>
              {plan.consultationQuestions.map((question, index) => <div key={question}><b>0{index + 1}</b><p>{question}</p></div>)}
            </div>

            <div className="medical-boundary"><CircleAlert size={20} /><p><strong>这是审美决策支持，不是诊断或处方。</strong><br />材料、剂量、适应证和风险必须由合规医生在面诊后确认。</p></div>
            <button className="secondary-button" type="button" onClick={() => goToScreen("direction")}><SlidersHorizontal size={18} /> 调整五官方向</button>
            <button className="secondary-button" type="button" onClick={() => goToScreen("source")}><RefreshCcw size={18} /> 更新审美样本</button>
            <button className="danger-link" type="button" onClick={resetAll}><Trash2 size={15} /> 删除全部本地数据</button>
          </section>
        )}
      </main>

      <nav className="progress-nav" aria-label="产品流程">
        {(["source", "profile", "face", "preferences", "direction", "plan"] as Screen[]).map((item, index) => (
          <button
            key={item}
            type="button"
            aria-label={`${NAV_LABELS[item]}${completed[item] ? "，已完成" : available[item] ? "" : "，尚未开放"}`}
            aria-current={screen === item ? "step" : undefined}
            disabled={!available[item]}
            className={screen === item ? "active" : completed[item] ? "complete" : ""}
            onClick={() => available[item] && goToScreen(item)}
          >
            <span>{completed[item] ? <Check size={13} /> : index + 1}</span>
          </button>
        ))}
      </nav>

      {showInstall && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowInstall(false)}>
          <div className="install-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <span className="sheet-handle" />
            <Download size={28} />
            <h2>安装到手机桌面</h2>
            <p>iPhone：用 Safari 打开，点击分享，再选“添加到主屏幕”。</p>
            <p>Android：用 Chrome 打开，选择“安装应用”。</p>
            <button type="button" onClick={() => setShowInstall(false)}>知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button className="back-button" type="button" onClick={onClick}><ArrowLeft size={20} /> 返回</button>;
}

function Axis({ label, value, opposite }: { label: string; value: number; opposite: string }) {
  return (
    <div className="axis">
      <div><span>{label}</span><span>{opposite}</span></div>
      <div className="axis-line"><i style={{ left: `${Math.min(96, Math.max(4, value))}%` }} /></div>
    </div>
  );
}

function ChoiceGroup({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="choice-group">
      <strong>{title}</strong>
      <div className="choice-grid">
        {options.map((option) => <button type="button" key={option} className={value === option ? "choice selected" : "choice"} onClick={() => onChange(option)}>{value === option && <Check size={15} />}{option}</button>)}
      </div>
    </div>
  );
}

function MultiChoice({ title, options, values, onChange, danger = false }: { title: string; options: string[]; values: string[]; onChange: (values: string[]) => void; danger?: boolean }) {
  return (
    <div className="choice-group">
      <strong>{title}</strong>
      <div className={`choice-grid priorities ${danger ? "danger-choices" : ""}`}>
        {options.map((option) => {
          const selected = values.includes(option);
          return <button type="button" key={option} className={selected ? "choice selected" : "choice"} onClick={() => onChange(selected ? values.filter((item) => item !== option) : [...values, option])}>{selected && <Check size={15} />}{option}</button>;
        })}
      </div>
    </div>
  );
}

export default App;
