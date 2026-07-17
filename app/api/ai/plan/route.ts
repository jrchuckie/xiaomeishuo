import { apiError, readJsonField } from "../_lib/common";
import { blobToOpenAIImage, startBackgroundStructuredPlan, type OpenAIContentPart } from "../_lib/openai";
import { finalizePersonalPlan, signPlanJob } from "../_lib/plan-job";

export const runtime = "nodejs";

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "executiveSummary",
    "aestheticSynthesis",
    "aestheticGoal",
    "currentState",
    "historyImpact",
    "observations",
    "unresolvedQuestions",
    "decisionLogic",
    "preserve",
    "avoid",
    "estimatedBudget",
    "consultationQuestions",
    "phases",
    "visualScenarios",
  ],
  properties: {
    headline: { type: "string", maxLength: 48 },
    executiveSummary: { type: "string", maxLength: 140 },
    aestheticSynthesis: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "styleKeywords", "featureSignals", "antiGoals", "referenceNotes"],
      properties: {
        summary: { type: "string" },
        styleKeywords: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
        featureSignals: {
          type: "array",
          minItems: 4,
          maxItems: 9,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["area", "preference", "evidence", "confidence", "preserve"],
            properties: {
              area: { type: "string" },
              preference: { type: "string" },
              evidence: { type: "string" },
              confidence: { type: "string", enum: ["高", "中", "低"] },
              preserve: { type: "string" },
            },
          },
        },
        antiGoals: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 8 },
        referenceNotes: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["referenceIndex", "decision", "signal", "reason"],
            properties: {
              referenceIndex: { type: "integer", minimum: 1, maximum: 6 },
              decision: { type: "string", enum: ["采纳", "谨慎采纳", "排除"] },
              signal: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
    aestheticGoal: { type: "string" },
    currentState: { type: "string" },
    historyImpact: { type: "array", items: { type: "string" } },
    observations: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "observation", "evidence", "implication", "confidence", "limit"],
        properties: {
          area: { type: "string" },
          observation: { type: "string" },
          evidence: { type: "string" },
          implication: { type: "string" },
          confidence: { type: "string", enum: ["高", "中", "低"] },
          limit: { type: "string" },
        },
      },
    },
    unresolvedQuestions: { type: "array", items: { type: "string" }, maxItems: 8 },
    decisionLogic: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 7 },
    preserve: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 7 },
    avoid: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 8 },
    estimatedBudget: { type: "string" },
    consultationQuestions: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 10 },
    phases: {
      type: "array",
      minItems: 3,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "title", "items"],
        properties: {
          label: { type: "string" },
          title: { type: "string" },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "title",
                "area",
                "reason",
                "action",
                "timing",
                "budget",
                "risk",
                "priority",
                "confidence",
                "evidence",
                "tradeoffs",
                "notNow",
                "reassessAfter",
                "historyAdjustment",
                "materials",
              ],
              properties: {
                title: { type: "string" },
                area: { type: "string" },
                reason: { type: "string" },
                action: { type: "string" },
                timing: { type: "string" },
                budget: { type: "string" },
                risk: { type: "string", enum: ["低", "中", "需医生评估"] },
                priority: { type: "string", enum: ["现在", "观察后", "可选", "不建议"] },
                confidence: { type: "string", enum: ["高", "中", "低"] },
                evidence: { type: "array", items: { type: "string" }, maxItems: 5 },
                tradeoffs: { type: "array", items: { type: "string" }, maxItems: 5 },
                notNow: { type: "string" },
                reassessAfter: { type: "string" },
                historyAdjustment: { type: "string" },
                materials: {
                  type: "array",
                  maxItems: 4,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "category", "area", "amountOptions", "fit", "evidence", "caveat", "whyFit", "whyNot", "reversibility"],
                    properties: {
                      name: { type: "string" },
                      category: { type: "string", enum: ["非医疗", "光电", "透明质酸", "再生材料", "肉毒毒素", "手术咨询"] },
                      area: { type: "string" },
                      amountOptions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
                      fit: { type: "string" },
                      evidence: { type: "string", enum: ["大陆已核验", "需核验具体型号/适应证", "非医疗服务"] },
                      caveat: { type: "string" },
                      whyFit: { type: "string" },
                      whyNot: { type: "string" },
                      reversibility: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    visualScenarios: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "title", "summary", "changes", "unchanged"],
        properties: {
          id: { type: "string", enum: ["stage-1", "stage-2", "stage-3"] },
          label: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          changes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
          unchanged: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        },
      },
    },
  },
} as const;

const SYSTEM_INSTRUCTION = `你是“小美说”的个人审美决策分析引擎，不是医生。你的任务是把用户自己的审美偏好、本人照片、预算边界和完整治疗史整理成可带去面诊的决策报告。

必须遵守：
1. 先从参考图提炼“这个用户眼中的美”，按轮廓、眼、鼻、唇、眉、皮肤、发型/胡须与整体气质写出反复出现的信号。每个判断必须指出来自哪些参考图；样本疑似 AI、重修、角度或妆造干扰时标为谨慎采纳或排除。
2. 再读取治疗史。既往项目、总量、区域、日期、效果和医生现有提案必须真实改变后续排序；信息不足写入 unresolvedQuestions，不能猜。
3. 本人照片只能支持外观观察，不能诊断组织层次、疾病、体脂、肌肉大小或精确毫米数。严格区分“看到什么”“可能意味着什么”“不能从照片确认什么”。
4. 不提供注射针点、层次、操作方法或个人处方。材料与用量写成可带去面诊比较的保守/标准情景，不声称某个剂量必然产生某毫米效果，最终由合规医生决定。
5. 不把主流审美当答案。方案必须围绕用户写明的目标、参考图共性、必须保留与明确排除项；不要自动美白、幼态化、瘦脸、放大眼睛或磨平个人特征。
6. 每项都写清：为什么进入候选、为什么不一定现在做、预期方向、代价与最坏风险、既往治疗如何改变判断、何时复评。把医生现有建议当待验证假设，不当作事实。
7. 只可使用输入中提供的候选项目库；库外品牌写“具体型号需核验”，不得编造大陆获批状态。产品获批不等于适合本人，治疗当天仍需核验说明书、适应证和注册信息。
8. 三个视觉阶段是给 Seedream 执行的审美编辑说明，不是治疗结果预测。changes 必须是照片中可见的具体变化，unchanged 必须锁定身份、未选区域、肤色、皮肤纹理和个人特色。
9. 语言像资深审美顾问与审慎医生共同复核后的报告：具体、有取舍、能解释，不打分，不夸大，不使用“必须做”“会帅多少”等话术。
10. executiveSummary 只写一到两句行动结论，不复述全部照片观察、治疗史和推理。每个 phase item 的 title 必须是用户能直接理解的具体项目名；action 先写“做什么”，再写边界。优先级必须拉开，不能把所有项目都写成“可选”。

这是信息整理与面诊准备，不构成诊断、处方或效果承诺。`;

const CANDIDATE_CATALOG = [
  { name: "M22 / AOPT 强脉冲光", category: "光电", evidence: "大陆已核验", rule: "只在皮肤分型支持时进入候选，不默认美白" },
  { name: "Thermage FLX 热玛吉", category: "光电", evidence: "大陆已核验", rule: "只讨论适应证与治疗区域，不承诺固定发数或提拉毫米" },
  { name: "乔雅登质颜 Juvéderm Volbella", category: "透明质酸", evidence: "大陆已核验", rule: "适应证和区域以治疗当天中文说明书为准" },
  { name: "乔雅登丰颜 Juvéderm Voluma", category: "透明质酸", evidence: "大陆已核验", rule: "只作为面诊比较情景，不自动推荐鼻部或下颌" },
  { name: "塑妍萃 Sculptra", category: "再生材料", evidence: "大陆已核验", rule: "说明渐进、不可玻尿酸酶溶解与结节等风险" },
  { name: "伊妍仕 Ellansé", category: "再生材料", evidence: "需核验具体型号/适应证", rule: "说明不可玻尿酸酶溶解与退出成本" },
  { name: "保妥适 Botox / 衡力", category: "肉毒毒素", evidence: "需核验具体产品/适应证", rule: "不同制剂单位不可直接换算，不给个人处方单位" },
  { name: "妆发、眉形试戴与造型", category: "非医疗", evidence: "非医疗服务", rule: "优先用可逆方式验证审美方向" },
] as const;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const context = readJsonField(form, "context");
    const input: OpenAIContentPart[] = [
      {
        type: "input_text",
        text: `请生成完整个人审美决策报告。参考图编号从1开始，只能使用实际提供的编号。所有结论必须回到用户目标、参考样本、本人正侧脸、治疗史与边界。\n\nUSER_CONTEXT\n${JSON.stringify(context)}\n\nCURATED_CANDIDATE_CATALOG\n${JSON.stringify(CANDIDATE_CATALOG)}`,
      },
    ];

    const imageOrder = ["front", form.get("left") instanceof Blob ? "left" : "right"];
    for (const key of imageOrder) {
      const value = form.get(key);
      if (value instanceof Blob && value.size > 0) {
        input.push({ type: "input_text", text: `${key.toUpperCase()}_FACE_PHOTO（本人当前状态，不是审美参考）` });
        input.push(await blobToOpenAIImage(value, "high"));
      }
    }
    for (let index = 0; index < 3; index += 1) {
      const value = form.get(`reference_${index}`);
      if (!(value instanceof Blob) || value.size === 0) continue;
      input.push({ type: "input_text", text: `AESTHETIC_REFERENCE_${index + 1}（审美参考图${index + 1}；判断是否采纳并说明依据，不得复制此人的脸）` });
      input.push(await blobToOpenAIImage(value, "low"));
    }

    const job = await startBackgroundStructuredPlan(
      SYSTEM_INSTRUCTION,
      input,
      PLAN_SCHEMA as unknown as Record<string, unknown>,
      { maxOutputTokens: 14000, reasoningEffort: "low", verbosity: "low" },
    );
    if (job.status === "completed") {
      return Response.json({ status: "completed", plan: finalizePersonalPlan(job.result) });
    }
    return Response.json({
      status: job.status,
      jobId: job.id,
      token: signPlanJob(job.id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
