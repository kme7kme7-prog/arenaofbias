import type { Prompt } from '@/lib/arena';
import './prompt-variant-switch.css';

export function PromptVariantSwitch({ prompt, selected, onChange }: {
  prompt: Prompt;
  selected: string;
  onChange: (id: string) => void;
}) {
  if (!prompt.promptVariants?.length) return null;
  return (
    <fieldset className="prompt-variant-switch" aria-label="提示词版本">
      {prompt.promptVariants.map((variant) => (
        <button key={variant.id} type="button" aria-pressed={selected === variant.id}
          onClick={() => onChange(variant.id)}>{variant.label}</button>
      ))}
    </fieldset>
  );
}
