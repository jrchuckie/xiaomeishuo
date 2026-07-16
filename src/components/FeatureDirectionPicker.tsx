import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { FeatureKey, FeatureSelections } from "../types";
import { renderFaceSimulation } from "./FaceSimulation";

type Props = {
  feature: { key: FeatureKey; label: string; options: string[]; note?: string };
  sourceUrl?: string;
  landmarks?: { x: number; y: number }[];
  selections: FeatureSelections;
  onSelect: (option: string) => void;
};

export default function FeatureDirectionPicker({ feature, sourceUrl, landmarks, selections, onSelect }: Props) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sourceUrl) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.src = sourceUrl;
    setLoading(true);
    image.decode().then(() => {
      const next = Object.fromEntries(feature.options.map((option) => [
        option,
        renderFaceSimulation(image, landmarks, { ...selections, [feature.key]: option }, 210, 280, 1.2),
      ]));
      if (!cancelled) {
        setPreviews(next);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [feature, landmarks, selections, sourceUrl]);

  return (
    <section className={`direction-group feature-${feature.key}`}>
      <div className="direction-heading">
        <strong>{feature.label}</strong>
        {feature.note && <span>{feature.note}</span>}
      </div>
      <div className="direction-options">
        {feature.options.map((option) => (
          <button
            type="button"
            key={option}
            className={selections[feature.key] === option ? "selected" : ""}
            onClick={() => onSelect(option)}
          >
            <span className="direction-preview">
              {previews[option]
                ? <img src={previews[option]} alt={`${feature.label}：${option}`} />
                : loading
                  ? <LoaderCircle className="spin" size={18} />
                  : <span className="direction-thumb">{feature.label.slice(0, 1)}</span>}
            </span>
            <b>{option}</b>
            {selections[feature.key] === option && <Check size={15} />}
          </button>
        ))}
      </div>
    </section>
  );
}
