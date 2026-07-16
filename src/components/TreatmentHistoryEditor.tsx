import { Plus, Trash2 } from "lucide-react";
import type { TreatmentHistoryEntry } from "../types";

type Props = {
  entries: TreatmentHistoryEntry[];
  onChange: (entries: TreatmentHistoryEntry[]) => void;
};

const CATEGORIES: TreatmentHistoryEntry["category"][] = [
  "透明质酸/填充",
  "肉毒毒素",
  "再生材料",
  "光电/皮肤",
  "手术",
  "其他",
];

const OUTCOMES: TreatmentHistoryEntry["outcome"][] = ["满意", "一般", "不满意", "仍在观察"];

function emptyEntry(): TreatmentHistoryEntry {
  return {
    id: crypto.randomUUID(),
    category: "透明质酸/填充",
    product: "",
    amount: "",
    areas: "",
    date: "",
    outcome: "仍在观察",
    adverseEvents: "",
    notes: "",
  };
}

export default function TreatmentHistoryEditor({ entries, onChange }: Props) {
  const update = (id: string, patch: Partial<TreatmentHistoryEntry>) => {
    onChange(entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };

  return (
    <div className="history-editor">
      <div className="history-intro">
        <strong>已做项目会直接改变下一步判断</strong>
        <p>请尽量写清产品、总量、具体区域和日期。例：某透明质酸共 4 mL，其中下巴正中 2 mL，其余用于颏沟、下缘和两侧过渡。</p>
      </div>

      {entries.map((entry, index) => (
        <article className="history-entry" key={entry.id}>
          <div className="history-entry-title"><span>治疗记录 {String(index + 1).padStart(2, "0")}</span><button type="button" onClick={() => onChange(entries.filter((item) => item.id !== entry.id))} aria-label="删除这条治疗记录"><Trash2 size={16} /></button></div>
          <div className="form-grid two">
            <label><span>项目类型</span><select value={entry.category} onChange={(event) => update(entry.id, { category: event.target.value as TreatmentHistoryEntry["category"] })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label><span>日期</span><input type="month" value={entry.date} onChange={(event) => update(entry.id, { date: event.target.value })} /></label>
          </div>
          <div className="form-grid two">
            <label><span>产品 / 品牌</span><input value={entry.product} onChange={(event) => update(entry.id, { product: event.target.value })} placeholder="不知道可写：不清楚" /></label>
            <label><span>总量 / 单位</span><input value={entry.amount} onChange={(event) => update(entry.id, { amount: event.target.value })} placeholder="例：4 mL / 每侧 20 U" /></label>
          </div>
          <label className="form-field"><span>具体做在哪里</span><textarea value={entry.areas} onChange={(event) => update(entry.id, { areas: event.target.value })} placeholder="不要只写‘下巴’，请写正中、颏沟、下缘、两侧过渡等实际分布" rows={2} /></label>
          <div className="form-grid two">
            <label><span>现在的感受</span><select value={entry.outcome} onChange={(event) => update(entry.id, { outcome: event.target.value as TreatmentHistoryEntry["outcome"] })}>{OUTCOMES.map((outcome) => <option key={outcome}>{outcome}</option>)}</select></label>
            <label><span>不良反应</span><input value={entry.adverseEvents} onChange={(event) => update(entry.id, { adverseEvents: event.target.value })} placeholder="没有可写：无" /></label>
          </div>
          <label className="form-field"><span>补充说明</span><textarea value={entry.notes} onChange={(event) => update(entry.id, { notes: event.target.value })} placeholder="例：医生建议三个月后追加；目前仍在消肿" rows={2} /></label>
        </article>
      ))}

      <button className="add-history" type="button" onClick={() => onChange([...entries, emptyEntry()])}><Plus size={17} /> 添加一项既往治疗</button>
    </div>
  );
}

