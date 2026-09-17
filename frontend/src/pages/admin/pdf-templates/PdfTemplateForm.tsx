import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SECTIONS } from './types';
import type { PdfTemplateConfig, SectionIcon } from './types';

// ─── Toggle component ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Champ numérique : état texte local, conversion/clamp au blur ────────────

function NumberField({
  value, min, max, onCommit,
}: { value: number | undefined; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value !== undefined && value !== null ? String(value) : '');

  useEffect(() => {
    setText(value !== undefined && value !== null ? String(value) : '');
  }, [value]);

  const commit = () => {
    const parsed = Number(text);
    if (text.trim() === '' || Number.isNaN(parsed)) {
      setText(value !== undefined && value !== null ? String(value) : '');
      return;
    }
    let clamped = parsed;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <Input
      type="number"
      value={text}
      min={min}
      max={max}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      className="w-24"
    />
  );
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function SectionAccordion({
  label, icon: Icon, open, onToggle, children,
}: {
  label: string;
  icon: SectionIcon;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-2.5 bg-muted/50 hover:bg-muted text-left text-sm font-medium"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </button>
      {open && <div className="p-4 space-y-3 border-t border-border">{children}</div>}
    </div>
  );
}

// ─── Sections editor : accordéon + champs typés (couleur/nombre/texte/bool) ──

interface PdfTemplateSectionsProps {
  config: PdfTemplateConfig;
  openSections: Set<string>;
  onToggleSection: (key: string) => void;
  onUpdateField: (section: string, key: string, value: unknown) => void;
}

export function PdfTemplateSections({
  config, openSections, onToggleSection, onUpdateField,
}: PdfTemplateSectionsProps) {
  return (
    <>
      {SECTIONS.map((section) => (
        <SectionAccordion
          key={section.key}
          label={section.label}
          icon={section.icon}
          open={openSections.has(section.key)}
          onToggle={() => onToggleSection(section.key)}
        >
          <div className="space-y-3">
            {section.fields.map((field) => {
              const sectionData = config[section.key as keyof PdfTemplateConfig] as Record<string, unknown>;
              const value = sectionData?.[field.key];

              if (field.type === 'color') {
                return (
                  <div key={field.key} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={(value as string) || '#000000'}
                      onChange={(e) => onUpdateField(section.key, field.key, e.target.value)}
                      className="h-8 w-10 rounded border border-border cursor-pointer"
                    />
                    <Label className="text-sm flex-1">{field.label}</Label>
                    <code className="text-xs text-muted-foreground font-mono">{value as string}</code>
                  </div>
                );
              }

              if (field.type === 'number') {
                return (
                  <div key={field.key} className="flex items-center gap-3">
                    <Label className="text-sm w-40 shrink-0">{field.label}</Label>
                    <NumberField
                      value={value as number | undefined}
                      min={field.min}
                      max={field.max}
                      onCommit={(v) => onUpdateField(section.key, field.key, v)}
                    />
                  </div>
                );
              }

              if (field.type === 'boolean') {
                return (
                  <div key={field.key} className="flex items-center justify-between">
                    <Label className="text-sm">{field.label}</Label>
                    <Toggle
                      checked={value as boolean}
                      onChange={(v) => onUpdateField(section.key, field.key, v)}
                    />
                  </div>
                );
              }

              // text
              return (
                <div key={field.key} className="space-y-1">
                  <Label className="text-sm">{field.label}</Label>
                  <Input
                    value={(value as string) || ''}
                    onChange={(e) => onUpdateField(section.key, field.key, e.target.value)}
                    maxLength={500}
                  />
                </div>
              );
            })}
          </div>
        </SectionAccordion>
      ))}
    </>
  );
}
