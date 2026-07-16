import type {
  AestheticProfile,
  FaceProfile,
  FeatureSelections,
  MaterialOption,
  PersonalPlan,
  PlanItem,
  UserPreferences,
} from "../types";

const BUDGET_COPY: Record<UserPreferences["budget"], string> = {
  "3000以内": "¥500–3,000",
  "3000–10000": "¥3,000–10,000",
  "1–3万": "¥10,000–30,000",
  "3万以上": "按阶段独立核算",
};

function material(option: MaterialOption) {
  return option;
}

function item(
  title: string,
  area: string,
  reason: string,
  action: string,
  timing: string,
  budget: string,
  risk: PlanItem["risk"],
  materials?: MaterialOption[],
): PlanItem {
  return { title, area, reason, action, timing, budget, risk, materials };
}

export function generatePlan(
  profile: AestheticProfile,
  face: FaceProfile,
  preferences: UserPreferences,
  selections: FeatureSelections,
): PersonalPlan {
  const topStyles = profile.styles.slice(0, 2).map((style) => style.label);
  const natural = profile.styles.some((style) => style.key === "natural" && style.score > 0.17);
  const sun = profile.styles.some((style) => style.key === "sun" && style.score > 0.14) || selections.skin === "健康暖调";
  const selectedBudget = BUDGET_COPY[preferences.budget];
  const rejectsNeedles = preferences.invasiveness === "不接受针剂" || preferences.excluded.includes("填充/针剂");
  const rejectsDevices = preferences.excluded.includes("光电项目");
  const rejectsPermanent = preferences.excluded.includes("手术") || preferences.riskTolerance === "非常保守";

  const validation: PlanItem[] = [
    item(
      selections.brows === "轻挑眉峰" ? "先试戴轻挑眉峰" : selections.brows === "清晰眉尾" ? "先试戴清晰眉尾" : "先验证自然眉形",
      "眉毛 / 眼周气质",
      "眉形成本低、可逆，能最快验证你偏好的利落度是否适合本人。",
      "用眉笔连续试戴 7 天；记录正脸和 45° 照片，再决定是否纹眉。",
      "第 1–2 周",
      "¥0–1,500",
      "低",
      [material({
        name: selections.brows === "轻挑眉峰" ? "微挑清冷眉" : selections.brows === "清晰眉尾" ? "原生毛流 + 清晰眉尾" : "自然平直眉",
        category: "非医疗",
        area: "双眉",
        amountOptions: ["7天妆容试戴", "确认后再评估半永久纹眉"],
        fit: "先验证气质，不改变面部结构。",
        evidence: "非医疗服务",
        caveat: "纹绣涉及破皮、色料、感染与褪色风险，需核验卫生条件。",
      })],
    ),
    item(
      "发型先改变脸周留白",
      "发型 / 颅顶 / 鬓角",
      face.summary[0] ?? "先用低风险方式验证整体比例方向。",
      selections.hair === "短发利落" ? "比较短发顶部高度、鬓角宽度和露额比例。" : selections.hair === "中长层次" ? "比较脸侧层次、偏分和颅顶蓬松度。" : "比较长发的分缝、脸侧留白与下颌遮挡。",
      "第 1–4 周",
      "¥300–2,000",
      "低",
      [material({
        name: selections.hair,
        category: "非医疗",
        area: "头发与脸周",
        amountOptions: ["一次剪发/造型试验", "两周照片复盘"],
        fit: "与你收藏样本中的脸周结构一致。",
        evidence: "非医疗服务",
        caveat: "发型模拟不等于面部结构变化。",
      })],
    ),
  ];

  if (preferences.medicalFlags.length > 0) {
    validation.unshift(item(
      "先完成病史与禁忌证核对",
      "全身状态 / 既往史",
      `你标记了：${preferences.medicalFlags.join("、")}。这些信息可能直接改变项目、材料与时间安排。`,
      "预约合规医生，带上用药清单与既往治疗记录；核对完成前不进入侵入性项目。",
      "任何项目之前",
      "面诊费用",
      "需医生评估",
    ));
  }

  if (preferences.motivation === "他人评价影响" || preferences.motivation === "医生建议后犹豫") {
    validation.unshift(item(
      "先确认这是你自己的改变目标",
      "决策动机",
      preferences.motivation === "他人评价影响" ? "外界评价容易把短期压力误译成长期改变。" : "单一医生的建议可能受个人审美、项目经验或商业关系影响。",
      "写下明确想改善、必须保留和不做也能接受的结果；两周后再复核一次。",
      "至少 14 天",
      "¥0",
      "低",
    ));
  }

  if (preferences.experience !== "第一次研究") {
    validation.push(item(
      "先复盘既往项目的真实收益",
      "既往治疗记录",
      `你选择了“${preferences.experience}”，新方案需要区分仍在起效、已经消退与曾经不满意的变化。`,
      "按时间列出产品、总量、治疗区域、日期、满意度与不良反应；能找到病历或产品标签时一并带去面诊。",
      "第 1–2 周",
      "¥0",
      "低",
    ));
  }

  const foundation: PlanItem[] = [];
  if (preferences.priorities.includes("肤质") || selections.skin !== "保留原生") {
    const skinMaterials: MaterialOption[] = [];
    if (!rejectsDevices) {
      skinMaterials.push(material({
        name: "M22 / AOPT 强脉冲光",
        category: "光电",
        area: "面部皮肤",
        amountOptions: ["1次试做并标准化拍照", "3次疗程候选，逐次复盘"],
        fit: sun ? "目标是均匀度和状态，不把变白作为默认方向。" : "用于医生区分色素、血管与整体均匀度问题。",
        evidence: "大陆已核验",
        caveat: "具体手具、参数和适应证由皮肤科/医美医生确认，不承诺一次变白。",
      }));
    }
    foundation.push(item(
      sun ? "保留健康肤色，先改善均匀度" : "先做皮肤分型，再选项目",
      "肤色 / 色素 / 血管 / 纹理",
      "同样是‘肤质不好’，可能来自完全不同的问题；先分型才能避免被项目名称带着走。",
      "素颜面诊并分别记录色素、血管、痤疮、屏障和纹理判断。",
      "第 3–10 周",
      selectedBudget,
      "需医生评估",
      skinMaterials.length ? skinMaterials : undefined,
    ));
  }

  if (preferences.priorities.includes("轮廓") || selections.contour !== "保留原生") {
    foundation.push(item(
      "先判断轮廓问题来自皮肤、软组织还是骨性结构",
      "面颈线条 / 下颌 / 面中",
      face.summary[1] ?? "一张自拍无法判断组织层次，不能把所有轮廓诉求都翻译成填充或提升。",
      "用同光线正侧脸记录；面诊时要求医生把皮肤松弛、脂肪、肌肉与骨性原因拆开。",
      "第 4–12 周",
      "¥0–20,000",
      "需医生评估",
      rejectsDevices ? undefined : [material({
        name: "Thermage FLX 热玛吉",
        category: "光电",
        area: "面部或眼周候选",
        amountOptions: ["一次治疗情景", "发数按设备型号和治疗区域面诊确认"],
        fit: "仅在医生判断存在适应证时作为紧致候选，不替代容量或骨性判断。",
        evidence: "大陆已核验",
        caveat: "不承诺精确提拉毫米数或人人相同的发数。",
      })],
    ));
  }

  const medical: PlanItem[] = [];
  if (!rejectsNeedles) {
    if (selections.lips === "轻微丰润") {
      medical.push(item(
        "唇部先比较保守总量情景",
        "唇红与唇缘",
        "你选择的是轻微丰润，不应直接推到夸张唇峰或统一模板。",
        "让医生分别展示不做、0.5 mL 级别和 1支以内的边界，并说明肿胀期与可逆性。",
        "完成前两阶段后",
        "¥3,000–10,000",
        "需医生评估",
        [material({
          name: "乔雅登质颜 Juvéderm Volbella",
          category: "透明质酸",
          area: "唇部候选",
          amountOptions: ["约0.5 mL 保守情景", "1支以内对照情景"],
          fit: "用于比较自然轮廓与轻微体量变化，不是直接处方。",
          evidence: "大陆已核验",
          caveat: "最终材料、总量、层次和针点必须由合规医生面诊确认。",
        })],
      ));
    }
    if (preferences.priorities.includes("轮廓") && preferences.budget !== "3000以内") {
      medical.push(item(
        "容量类项目以总量情景比较，不按部位堆支数",
        "面颊 / 太阳穴 / 面中候选",
        "先确认是否真的存在容量缺失，再比较即时填充与渐进改善。",
        "要求医生把作用区域、每次总量、累计总量、可逆性和最坏风险写入面诊单。",
        "第 3 个月以后",
        selectedBudget,
        "需医生评估",
        [
          material({
            name: "乔雅登丰颜 Juvéderm Voluma",
            category: "透明质酸",
            area: "面颊/太阳穴候选，以现行说明书为准",
            amountOptions: ["0.5–1.0 mL 保守比较情景", "1–2 mL 分区/分次情景"],
            fit: "适合比较即时支撑与过渡，不默认用于鼻部或下颌。",
            evidence: "大陆已核验",
            caveat: "获批不等于适合；预约当天核对中文产品名、注册证和适应证。",
          }),
          material({
            name: "塑妍萃 Sculptra",
            category: "再生材料",
            area: "面中部候选，以现行说明书为准",
            amountOptions: ["1瓶起始情景", "2瓶分次情景"],
            fit: "用于比较渐进式改善，不作为即时填充效果图。",
            evidence: "大陆已核验",
            caveat: "结果延迟且不可用玻尿酸酶溶解；必须讨论结节等风险。",
          }),
          material({
            name: "伊妍仕 Ellansé",
            category: "再生材料",
            area: "医生确认的获批区域",
            amountOptions: ["1支保守情景", "分次追加情景"],
            fit: "比较即时支撑与渐进刺激的差异。",
            evidence: "需核验具体型号/适应证",
            caveat: "不可用玻尿酸酶溶解，需特别确认可逆性与操作者经验。",
          }),
        ],
      ));
    }
  }

  if (selections.nose !== "保留原生") {
    medical.push(item(
      "鼻部不在 App 内给出注射剂量",
      "鼻背 / 鼻尖",
      "鼻部注射存在高风险血管区域；照片和审美偏好不足以决定材料、层次或剂量。",
      "把本人的侧面方向预览带给至少两位合规医生，分别比较不做、非手术与手术路径。",
      "不少于30天冷静期",
      "独立面诊报价",
      "需医生评估",
      [material({
        name: "鼻整形独立面诊",
        category: "手术咨询",
        area: "鼻部",
        amountOptions: ["不做", "保守改变", "手术路径"],
        fit: "围绕鼻背直线或鼻尖精致方向讨论，而不是复制参考图。",
        evidence: "需核验具体型号/适应证",
        caveat: "App 不提供鼻部针点、层次和剂量，也不承诺同款效果。",
      })],
    ));
  }

  if (preferences.invasiveness === "可讨论手术" && !rejectsPermanent) {
    medical.push(item(
      "任何手术方向都设置独立冷静期",
      "眼部 / 鼻部 / 颏部等候选",
      "手术不可逆，不能由收藏样本或一次 AI 模拟直接推导。",
      "至少两次独立面诊；比较不做、保守和手术三条路径，并核对恢复期。",
      "不少于30天",
      "独立报价",
      "需医生评估",
    ));
  }

  if (!medical.length) {
    medical.push(item(
      "保持非侵入路径",
      "整体外观",
      "你的边界明确排除针剂或手术，方案不会用‘效果最好’越过这个选择。",
      "继续用妆发、皮肤管理和标准化照片验证方向。",
      "持续",
      selectedBudget,
      "低",
    ));
  }

  const preserve = [
    natural ? "原生感与自然不对称" : "个人辨识度",
    sun ? "健康暖调肤色" : "真实肤色",
    ...preferences.mustPreserve.slice(0, 3),
  ].filter((value, index, array) => array.indexOf(value) === index);

  return {
    headline: `${topStyles.join(" × ")}：先验证方向，再分阶段做决定`,
    preserve,
    avoid: ["照搬单一明星或网红模板", "把 AI 方向图当作效果承诺", ...preferences.excluded],
    estimatedBudget: `单次 ${selectedBudget}；年度边界 ${preferences.annualBudget}`,
    consultationQuestions: [
      "你认为问题来自皮肤、脂肪、肌肉、容量还是骨性结构？证据是什么？",
      "这个产品的中文注册名、适应证、总量和分次计划分别是什么？",
      "不做、保守做和完整做三种路径的效果边界与最坏风险是什么？",
      "商业合作或库存是否影响了材料与项目排序？",
    ],
    phases: [
      { label: "PHASE 0 · 现在", title: "先验证审美方向", items: validation },
      { label: "PHASE 1 · 1–3个月", title: "建立低风险基础", items: foundation.length ? foundation : [item("保持现状并标准化记录", "整体", "没有足够证据需要立即进入项目。", "每月同光线拍摄正侧脸并复盘。", "1–3个月", "¥0", "低")] },
      { label: "PHASE 2 · 方向确认后", title: "带着可比较的情景去面诊", items: medical },
    ],
  };
}
