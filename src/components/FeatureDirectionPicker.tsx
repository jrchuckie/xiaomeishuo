import { Check, ScanFace } from "lucide-react";
import type { FeatureKey, FeatureSelections } from "../types";

type Props = {
  feature: { key: FeatureKey; label: string; options: string[]; note?: string };
  selections: FeatureSelections;
  onSelect: (option: string) => void;
};

const OPTION_NOTES: Record<string, string> = {
  "保留原生": "不把主流模板强加到你脸上",
  "轻微放大": "保留眼型，只比较更有神的方向",
  "拉长眼尾": "比较横向延伸，不默认做双眼皮",
  "鼻尖精致": "比较鼻尖收束感，不等于注射建议",
  "直线鼻背": "比较更利落的侧面线条",
  "收窄下颌": "比较下脸边界，不自动削弱骨点",
  "下巴舒展": "比较下庭纵向比例与侧面投射",
  "清晰眉尾": "保留毛流，提升眉尾完成度",
  "轻挑眉峰": "比较更锐利、更有方向感的气质",
  "边界清晰": "保留体量，强化唇缘清晰度",
  "轻微丰润": "比较克制体量，不做模板唇",
  "均匀透亮": "改善均匀度，不默认追求冷白",
  "健康暖调": "保留或增强健康暖调肤色",
  "短发利落": "强化颅顶、鬓角和面部留白",
  "中长层次": "用脸周层次调节轮廓与气质",
  "长发柔和": "用长度和分缝增加柔和感",
};

export default function FeatureDirectionPicker({ feature, selections, onSelect }: Props) {
  return (
    <section className={`direction-group feature-${feature.key}`}>
      <div className="direction-heading">
        <strong>{feature.label}</strong>
        <span>{feature.note || "选择审美方向；真实 AI 效果图将在完整方案中按需生成"}</span>
      </div>
      <div className="direction-options semantic">
        {feature.options.map((option) => (
          <button type="button" key={option} className={selections[feature.key] === option ? "selected" : ""} onClick={() => onSelect(option)}>
            <span className="direction-symbol"><ScanFace size={20} /></span>
            <span className="direction-option-copy"><b>{option}</b><small>{OPTION_NOTES[option] || "在完整方案中比较"}</small></span>
            {selections[feature.key] === option && <Check size={16} />}
          </button>
        ))}
      </div>
    </section>
  );
}
