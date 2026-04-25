import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  Check,
  ChevronDown,
  Columns2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Rows2,
  Sparkles,
  StretchHorizontal,
  Trash2,
  X,
} from "lucide-react";

const PROVIDERS = [
  {
    key: "nanobanana",
    label: "Nanobanana",
    capability: "Image repaint",
    placeholder: "nb_live_xxx...",
    defaultModels: [
      { id: "gemini-2.0-flash-exp-image-generation", name: "Gemini 2.0 Flash (Image)" },
      { id: "gemini-2.0-flash-preview-image-generation", name: "Gemini 2.0 Flash Preview" },
      { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro (Image)" },
      { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash (Image)" },
    ],
  },
  {
    key: "openai",
    label: "OpenAI (GPT Image)",
    capability: "Image edit & repaint",
    placeholder: "sk-xxx...",
    defaultModels: [
      { id: "gpt-image-1", name: "GPT Image 1" },
    ],
  },
  {
    key: "jimeng",
    label: "即梦 (Jimeng)",
    capability: "Image generation & editing",
    authFields: ["access_key_id", "secret_access_key"],
    placeholders: { access_key_id: "Access Key ID", secret_access_key: "Secret Access Key" },
    defaultModels: [
      { id: "jimeng_t2i_v40", name: "即梦 图片生成 4.0" },
      { id: "jimeng_seedream46_cvtob", name: "即梦 图片生成 4.6" },
      { id: "jimeng_i2i_seed3_tilesr_cvtob", name: "即梦 智能超清" },
    ],
  },
];

const ASPECT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

const RESOLUTION_OPTIONS = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

const INITIAL_STYLES = [
  {
    id: "cinematic-soft",
    name: "Cinematic Soft",
    prompt: "Cinematic natural light, restrained contrast, finer texture, softened background detail.",
  },
  {
    id: "editorial-clean",
    name: "Editorial Clean",
    prompt: "Premium editorial finish, balanced highlights, realistic detail recovery, polished atmosphere.",
  },
  {
    id: "dream-fog",
    name: "Dream Fog",
    prompt: "Luminous mist, layered depth, cool-blue shadows, warm practical lights, soft surreal mood.",
  },
];

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

const TOOLBAR_FIELD =
  "h-8 w-full rounded-md border border-border/70 bg-app px-2 py-0 text-[12px] text-text outline-none hover:border-border focus:border-accent/50";
const TOOLBAR_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-app px-3 py-0 text-[12px] font-medium text-text transition-colors hover:border-border hover:bg-hover";
const ACCENT_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-md bg-[rgb(var(--accent-color))] px-3 py-0 text-[12px] font-medium text-black transition-colors hover:brightness-110";

function PanelLabel({ children }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted2">{children}</div>;
}

function CollapsibleSection({ label, collapsed, onToggle, border = "border-b", className, children, trailing }) {
  return (
    <div className={cx(border, "border-border/60", className)}>
      <div className="flex w-full items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={onToggle}
        >
          <ChevronDown className={cx("h-3 w-3 text-muted2 transition-transform", collapsed && "-rotate-90")} />
          <PanelLabel>{label}</PanelLabel>
        </button>
        {trailing && <div className="ml-auto">{trailing}</div>}
      </div>
      {!collapsed && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function StyleCard({ style, active, onSelect, onEdit, onDelete }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cx(
        "w-full rounded-lg border px-3 py-3 text-left transition-colors",
        active
          ? "border-[rgb(var(--accent-color)/0.38)] bg-[rgb(var(--accent-color)/0.10)]"
          : "border-border/60 bg-app hover:border-border hover:bg-hover/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-text">{style.name}</div>
          <div className="mt-1 truncate pr-1 text-[11px] leading-5 text-muted">{style.prompt}</div>
        </div>
        <div className="ml-2 flex shrink-0 items-start gap-1">
          <button
            type="button"
            className="rounded-md p-1 text-muted2 transition-colors hover:bg-white/6 hover:text-text"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            title="Edit style"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-muted2 transition-colors hover:bg-white/6 hover:text-text"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            title="Delete style"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StyleRow({ style, active, onSelect, onEdit, onDelete }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cx(
        "group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors",
        active
          ? "bg-selected text-text"
          : "text-muted hover:bg-hover/70 hover:text-text",
      )}
    >
      <span className="truncate text-[12px]">{style.name}</span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          className="rounded-md p-0.5 text-muted2 transition-colors hover:text-text"
          onClick={(event) => { event.stopPropagation(); onEdit(); }}
          title="Edit style"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="rounded-md p-0.5 text-muted2 transition-colors hover:text-text"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          title="Delete style"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </span>
    </div>
  );
}

function EditStyleModal({ title, draft, onChange, onSave, onClose }) {
  return (
    <div className="fixed inset-0 z-[10210] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] overflow-hidden rounded-xl border border-border/60 bg-chrome shadow-overlay">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <PanelLabel>{title}</PanelLabel>
            <button
              type="button"
              className="rounded-md p-1 text-muted2 transition-colors hover:bg-white/6 hover:text-text"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            placeholder="Style name"
            className={`mt-3 ${TOOLBAR_FIELD} placeholder:text-muted2`}
            autoFocus
          />
          <textarea
            value={draft.prompt}
            onChange={(event) => onChange({ ...draft, prompt: event.target.value })}
            placeholder="Prompt"
            className="mt-2 min-h-[96px] w-full rounded-md border border-border/70 bg-app px-2 py-2 text-[12px] leading-5 text-text outline-none placeholder:text-muted2 hover:border-border focus:border-accent/50"
          />
        </div>
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <button type="button" className={ACCENT_BUTTON} onClick={onSave}>
            Save style
          </button>
          <button type="button" className={TOOLBAR_BUTTON} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigureApiModal({
  providers,
  providerKey,
  tokenValue,
  hasToken,
  onChangeProvider,
  onChangeToken,
  onSave,
  onRemove,
  onClose,
}) {
  const currentProvider = providers.find((p) => p.key === providerKey);
  const isMultiField = Boolean(currentProvider?.authFields);

  // For multi-field providers, parse tokenValue as JSON
  const parsedFields = useMemo(() => {
    if (!isMultiField) return {};
    try { return JSON.parse(tokenValue || "{}"); } catch { return {}; }
  }, [tokenValue, isMultiField]);

  function updateField(fieldName, value) {
    const next = { ...parsedFields, [fieldName]: value };
    onChangeToken(JSON.stringify(next));
  }

  return (
    <div className="fixed inset-0 z-[10210] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] overflow-hidden rounded-xl border border-border/60 bg-chrome shadow-overlay">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <PanelLabel>Provider</PanelLabel>
            <button
              type="button"
              className="rounded-md p-1 text-muted2 transition-colors hover:bg-white/6 hover:text-text"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <label className="mt-2 block">
            <select
              value={providerKey}
              onChange={(event) => onChangeProvider(event.target.value)}
              className={TOOLBAR_FIELD}
            >
              {providers.map((provider) => (
                <option key={provider.key} value={provider.key}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-5">
            <PanelLabel>{isMultiField ? "Credentials" : "API Token"}</PanelLabel>
          </div>

          {isMultiField ? (
            <div className="mt-2 space-y-2">
              {currentProvider.authFields.map((field) => (
                <div key={field} className="flex h-8 items-center gap-2 rounded-md border border-border/70 bg-app px-2 hover:border-border focus-within:border-accent/50">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted2" />
                  <input
                    value={parsedFields[field] || ""}
                    onChange={(event) => updateField(field, event.target.value)}
                    placeholder={currentProvider.placeholders?.[field] || field}
                    className="h-full flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-muted2"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex h-8 items-center gap-2 rounded-md border border-border/70 bg-app px-2 hover:border-border focus-within:border-accent/50">
              <KeyRound className="h-3.5 w-3.5 text-muted2" />
              <input
                value={tokenValue}
                onChange={(event) => onChangeToken(event.target.value)}
                placeholder={currentProvider?.placeholder || "API key..."}
                className="h-full flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-muted2"
              />
            </div>
          )}
          <div className="mt-2 text-[11px] text-muted">{hasToken ? "Credentials saved (encrypted)." : "Required before Generate."}</div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            className={ACCENT_BUTTON}
            onClick={onSave}
          >
            Save
          </button>
          <button
            type="button"
            className={TOOLBAR_BUTTON}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiRepaintPanel({ sourcePath, sourceLabel = "Current image", onCompareChange, compareState, onRepaintComplete }) {
  const repaintPollRef = useRef(null);
  const prefsRef = useRef({});
  const [activeProviderKey, setActiveProviderKey] = useState(null);
  const [providerConfigs, setProviderConfigs] = useState({});
  const [modalProviderKey, setModalProviderKey] = useState(PROVIDERS[0].key);
  const [styles, setStyles] = useState(null);
  const [selectedStyleId, setSelectedStyleId] = useState(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [showApiModal, setShowApiModal] = useState(false);
  const [editingStyleId, setEditingStyleId] = useState(null);
  const [styleDraft, setStyleDraft] = useState({ name: "", prompt: "" });
  const [temperature, setTemperature] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [resolution, setResolution] = useState("4k");
  const [customPrompt, setCustomPrompt] = useState("");
  const [compactStyles, setCompactStyles] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [generateStatus, setGenerateStatus] = useState({ running: false, status: null, error: null });
  const [results, setResults] = useState([]);
  const [repaintHistory, setRepaintHistory] = useState([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [availableModels, setAvailableModels] = useState(() => {
    const init = {};
    for (const p of PROVIDERS) init[p.key] = p.defaultModels;
    return init;
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    const init = {};
    for (const p of PROVIDERS) init[p.key] = p.defaultModels[0]?.id || "";
    return init;
  });

  const provider = useMemo(
    () => PROVIDERS.find((entry) => entry.key === activeProviderKey) || null,
    [activeProviderKey],
  );
  const selectedStyle = useMemo(
    () => styles?.find((entry) => entry.id === selectedStyleId) || null,
    [styles, selectedStyleId],
  );
  const providerConfig = activeProviderKey ? providerConfigs[activeProviderKey] || null : null;
  const providerConfigured = Boolean(providerConfig?.token);
  const modalProviderConfig = providerConfigs[modalProviderKey] || null;
  const activeModelId = activeProviderKey ? selectedModel[activeProviderKey] : null;
  const isUpscaleModel = activeModelId === "jimeng_i2i_seed3_tilesr_cvtob";

  function persistPrefs(patch) {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    void window.mediaWorkspace?.saveAiPreferences?.(next);
  }

  function updateActiveProvider(providerKey) {
    setActiveProviderKey(providerKey);
    persistPrefs({ activeProvider: providerKey });
  }

  function updateSelectedModel(providerKey, modelId) {
    setSelectedModel((current) => ({ ...current, [providerKey]: modelId }));
    persistPrefs({ selectedModels: { ...prefsRef.current.selectedModels, [providerKey]: modelId } });
  }

  async function fetchModels(providerKey) {
    const models = await window.mediaWorkspace?.listAiModels?.(providerKey);
    if (Array.isArray(models) && models.length) {
      setAvailableModels((current) => ({ ...current, [providerKey]: models }));
      persistPrefs({ modelsCache: { ...prefsRef.current.modelsCache, [providerKey]: models } });
      setSelectedModel((current) => {
        if (current[providerKey] && models.some((m) => m.id === current[providerKey])) return current;
        const fallback = models[0].id;
        persistPrefs({ selectedModels: { ...prefsRef.current.selectedModels, [providerKey]: fallback } });
        return { ...current, [providerKey]: fallback };
      });
    }
  }

  useEffect(() => {
    async function loadStored() {
      // Fire all IPC calls in parallel for speed
      const [prefs, saved, ...providerPayloads] = await Promise.all([
        window.mediaWorkspace?.getAiPreferences?.().then((p) => p || {}),
        window.mediaWorkspace?.getAiStyles?.(),
        ...PROVIDERS.map((p) => window.mediaWorkspace?.getAiProviderToken?.(p.key).then((r) => ({ key: p.key, ...r }))),
      ]);

      // Apply preferences
      prefsRef.current = prefs;
      if (prefs.activeProvider) setActiveProviderKey(prefs.activeProvider);
      if (prefs.selectedModels) setSelectedModel((cur) => ({ ...cur, ...prefs.selectedModels }));
      if (prefs.modelsCache) setAvailableModels((cur) => ({ ...cur, ...prefs.modelsCache }));

      // Apply provider tokens
      for (const payload of providerPayloads) {
        if (payload?.token) {
          const { key, ...config } = payload;
          setProviderConfigs((current) => ({ ...current, [key]: config }));
          if (!prefs.activeProvider) setActiveProviderKey((current) => current || key);
          fetchModels(key);
        }
      }

      // Apply styles
      if (Array.isArray(saved) && saved.length) {
        setStyles(saved);
        setSelectedStyleId((current) => {
          if (current && saved.some((s) => s.id === current)) return current;
          return saved[0]?.id ?? null;
        });
      } else {
        setStyles(INITIAL_STYLES);
        setSelectedStyleId(INITIAL_STYLES[0]?.id ?? null);
        persistStyles(INITIAL_STYLES);
      }
    }
    void loadStored();
    return () => {
      if (repaintPollRef.current) {
        clearInterval(repaintPollRef.current);
        repaintPollRef.current = null;
      }
    };
  }, []);

  function toggleSection(key) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Load repaint history for current source image
  useEffect(() => {
    if (!sourcePath) return;
    void (async () => {
      const history = await window.mediaWorkspace?.listRepaintHistory?.(sourcePath);
      if (Array.isArray(history)) setRepaintHistory(history);
    })();
  }, [sourcePath]);

  // Refresh history after a new repaint completes
  function refreshHistory() {
    if (!sourcePath) return;
    void (async () => {
      const history = await window.mediaWorkspace?.listRepaintHistory?.(sourcePath);
      if (Array.isArray(history)) setRepaintHistory(history);
    })();
  }

  function persistStyles(nextStyles) {
    void window.mediaWorkspace?.saveAiStyles?.(nextStyles);
  }

  useEffect(() => {
    if (!showApiModal) return;
    setModalProviderKey(activeProviderKey || PROVIDERS[0].key);
  }, [activeProviderKey, showApiModal]);

  useEffect(() => {
    if (!showApiModal) return;
    setTokenDraft(modalProviderConfig?.token || "");
  }, [modalProviderConfig, showApiModal]);

  function resetDraft() {
    setEditingStyleId(null);
    setStyleDraft({ name: "", prompt: "" });
  }

  function openCreateStyle() {
    setEditingStyleId("new");
    setStyleDraft({ name: "", prompt: "" });
  }

  function openEditStyle(style) {
    setEditingStyleId(style.id);
    setStyleDraft({ name: style.name, prompt: style.prompt });
  }

  function saveStyleDraft() {
    const name = styleDraft.name.trim();
    const prompt = styleDraft.prompt.trim();
    if (!name || !prompt) return;

    if (editingStyleId && editingStyleId !== "new") {
      setStyles((current) => {
        const next = current.map((entry) => (entry.id === editingStyleId ? { ...entry, name, prompt } : entry));
        persistStyles(next);
        return next;
      });
      setSelectedStyleId(editingStyleId);
    } else {
      const nextId = `style-${Date.now()}`;
      setStyles((current) => {
        const next = [...current, { id: nextId, name, prompt }];
        persistStyles(next);
        return next;
      });
      setSelectedStyleId(nextId);
    }
    resetDraft();
  }

  function deleteStyle(styleId) {
    setStyles((current) => {
      const next = current.filter((entry) => entry.id !== styleId);
      persistStyles(next);
      setSelectedStyleId((selected) => (selected === styleId ? next[0]?.id ?? null : selected));
      return next;
    });
    if (editingStyleId === styleId) resetDraft();
  }

  function saveToken() {
    const modalProvider = PROVIDERS.find((p) => p.key === modalProviderKey);
    let nextToken = tokenDraft.trim();
    if (modalProvider?.authFields) {
      // Multi-field: validate all fields are filled
      try {
        const parsed = JSON.parse(nextToken || "{}");
        if (modalProvider.authFields.some((f) => !parsed[f]?.trim())) return;
      } catch { return; }
    } else {
      if (!nextToken) return;
    }
    void (async () => {
      const payload = await window.mediaWorkspace?.setAiProviderToken?.(modalProviderKey, nextToken);
      setProviderConfigs((current) => ({
        ...current,
        [modalProviderKey]: payload?.token ? payload : { token: nextToken },
      }));
      updateActiveProvider(modalProviderKey);
      setShowApiModal(false);
      fetchModels(modalProviderKey);
    })();
  }

  function removeToken() {
    setTokenDraft("");
    void (async () => {
      await window.mediaWorkspace?.deleteAiProviderToken?.(modalProviderKey);
      setProviderConfigs((current) => {
        const next = { ...current };
        delete next[modalProviderKey];
        return next;
      });
      setActiveProviderKey((current) => {
        const next = current === modalProviderKey ? null : current;
        persistPrefs({ activeProvider: next });
        return next;
      });
    })();
  }

  function queueApply() {
    const effectivePrompt = customPrompt.trim() || selectedStyle?.prompt;
    if (!isUpscaleModel && !effectivePrompt) return;
    if (!providerConfigured) {
      setShowApiModal(true);
      return;
    }
    if (!sourcePath) return;
    void (async () => {
      const providerKey = activeProviderKey || PROVIDERS[0].key;
      const task = await window.mediaWorkspace?.startAiRepaint?.({
        provider: providerKey,
        sourcePath,
        prompt: isUpscaleModel ? "" : effectivePrompt,
        aspectRatio: aspectRatio === "auto" ? null : aspectRatio,
        resolution,
        temperature,
        model: selectedModel[providerKey] || null,
      });
      setGenerateStatus({
        running: Boolean(task?.running),
        status: task?.status || null,
        error: task?.error || null,
      });
    })();
  }

  useEffect(() => {
    if (!generateStatus.running) {
      if (repaintPollRef.current) {
        clearInterval(repaintPollRef.current);
        repaintPollRef.current = null;
      }
      return undefined;
    }
    repaintPollRef.current = window.setInterval(async () => {
      const task = await window.mediaWorkspace?.getAiRepaintStatus?.();
      setGenerateStatus({
        running: Boolean(task?.running),
        status: task?.status || null,
        error: task?.error || null,
      });
      if (!task?.running && repaintPollRef.current) {
        clearInterval(repaintPollRef.current);
        repaintPollRef.current = null;
        const outputPath = task?.result?.output_path;
        if (task?.status === "succeeded" && outputPath) {
          setResults((prev) => [
            { path: outputPath, timestamp: Date.now(), prompt: task.result.prompt || "" },
            ...prev,
          ]);
          onRepaintComplete?.();
          refreshHistory();
        }
      }
    }, 1500);
    return () => {
      if (repaintPollRef.current) {
        clearInterval(repaintPollRef.current);
        repaintPollRef.current = null;
      }
    };
  }, [generateStatus.running]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <CollapsibleSection label="Provider" collapsed={collapsedSections.has("provider")} onToggle={() => toggleSection("provider")}>
          <div className="flex items-center gap-2">
            <select
              value={activeProviderKey || ""}
              onChange={(event) => updateActiveProvider(event.target.value)}
              className={`min-w-0 flex-1 ${TOOLBAR_FIELD}`}
            >
              {PROVIDERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}{providerConfigs[p.key]?.token ? "" : " (not configured)"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-app text-text transition-colors hover:border-border hover:bg-hover"
              onClick={() => { setModalProviderKey(activeProviderKey || PROVIDERS[0].key); setShowApiModal(true); }}
              title="Configure API key"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-muted">Model</div>
            <select
              value={selectedModel[activeProviderKey] || ""}
              onChange={(event) => updateSelectedModel(activeProviderKey, event.target.value)}
              className={`mt-1 ${TOOLBAR_FIELD}`}
            >
              {(availableModels[activeProviderKey] || []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </CollapsibleSection>

        <CollapsibleSection label="Parameters" collapsed={collapsedSections.has("parameters")} onToggle={() => toggleSection("parameters")}>
          <div className={cx(isUpscaleModel && "opacity-40 pointer-events-none")}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-text">Temperature</div>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                disabled={isUpscaleModel}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isNaN(next)) return;
                  setTemperature(Math.max(0, Math.min(1, next)));
                }}
                className="h-8 w-16 rounded-md border border-border/70 bg-app px-2 py-0 text-[12px] text-text outline-none hover:border-border focus:border-accent/50"
              />
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              disabled={isUpscaleModel}
              onChange={(event) => setTemperature(Number(event.target.value))}
              className="mt-3 w-full"
              aria-label="Temperature"
            />
          </div>

          <div className={cx("mt-4", isUpscaleModel && "opacity-40 pointer-events-none")}>
            <div className="text-[12px] text-text">Aspect ratio</div>
            <select
              value={aspectRatio}
              disabled={isUpscaleModel}
              onChange={(event) => setAspectRatio(event.target.value)}
              className={`mt-2 ${TOOLBAR_FIELD}`}
            >
              {ASPECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="text-[12px] text-text">Resolution</div>
            <select
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              className={`mt-2 ${TOOLBAR_FIELD}`}
            >
              {RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          label="My Styles"
          collapsed={collapsedSections.has("styles")}
          onToggle={() => toggleSection("styles")}
          className={isUpscaleModel ? "opacity-40 pointer-events-none" : undefined}
          trailing={
            /* eslint-disable-next-line jsx-a11y/click-events-have-key-events */
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded transition-colors",
                  compactStyles ? "text-muted2 hover:bg-hover hover:text-text" : "bg-hover text-text",
                )}
                onClick={() => setCompactStyles(false)}
                title="Expanded view"
              >
                <StretchHorizontal className="h-3 w-3" />
              </button>
              <button
                type="button"
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded transition-colors",
                  compactStyles ? "bg-hover text-text" : "text-muted2 hover:bg-hover hover:text-text",
                )}
                onClick={() => setCompactStyles(true)}
                title="Compact view"
              >
                <AlignJustify className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded border border-border/70 bg-app text-text transition-colors hover:border-border hover:bg-hover"
                onClick={openCreateStyle}
                title="New style"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          }
        >
          <div className="mb-3">
            <div className="relative">
              <textarea
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="Enter a one-time prompt..."
                rows={2}
                className="w-full resize-none rounded-md border border-border/70 bg-app px-2.5 py-2 text-[12px] leading-5 text-text outline-none placeholder:text-muted2 hover:border-border focus:border-accent/50"
              />
              {customPrompt.trim() && (
                <button
                  type="button"
                  className="mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-hover hover:text-text"
                  onClick={() => {
                    setEditingStyleId("new");
                    setStyleDraft({ name: "", prompt: customPrompt.trim() });
                  }}
                  title="Save as style"
                >
                  <Plus className="h-3 w-3" />
                  Save as style
                </button>
              )}
            </div>
          </div>
          <div className={cx(compactStyles ? "space-y-0.5" : "space-y-2")}>
            {!styles ? (
              <div className="flex items-center gap-2 py-4 text-[11px] text-muted2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading styles…
              </div>
            ) : styles.map((style) => compactStyles ? (
              <StyleRow
                key={style.id}
                style={style}
                active={selectedStyleId === style.id}
                onSelect={() => setSelectedStyleId(style.id)}
                onEdit={() => openEditStyle(style)}
                onDelete={() => deleteStyle(style.id)}
              />
            ) : (
              <StyleCard
                key={style.id}
                style={style}
                active={selectedStyleId === style.id}
                onSelect={() => setSelectedStyleId(style.id)}
                onEdit={() => openEditStyle(style)}
                onDelete={() => deleteStyle(style.id)}
              />
            ))}
          </div>
        </CollapsibleSection>

        {results.length > 0 ? (
          <CollapsibleSection label="Results" border="border-t" collapsed={collapsedSections.has("results")} onToggle={() => toggleSection("results")}>
            <div className="space-y-1">
              {results.map((r) => {
                const name = r.path.split("/").pop();
                const isComparing = compareState?.afterPath === r.path;
                return (
                  <div
                    key={r.path}
                    className={cx(
                      "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors",
                      isComparing ? "bg-[rgb(var(--accent-color)/0.12)] text-[rgb(var(--accent-color))]" : "text-muted hover:bg-hover hover:text-text",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate" title={r.path}>{name}</span>
                    <button
                      type="button"
                      className={cx(
                        "flex h-5 w-5 items-center justify-center rounded transition-colors",
                        isComparing
                          ? "text-[rgb(var(--accent-color))]"
                          : "text-muted2 opacity-0 group-hover:opacity-100 hover:text-text",
                      )}
                      onClick={() => {
                        if (isComparing) {
                          onCompareChange?.(null);
                        } else {
                          onCompareChange?.({ afterPath: r.path, layout: compareState?.layout || "side" });
                        }
                      }}
                      title={isComparing ? "Exit compare" : "Compare side-by-side"}
                    >
                      <Columns2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className={cx(
                        "flex h-5 w-5 items-center justify-center rounded transition-colors",
                        isComparing && compareState?.layout === "stack"
                          ? "text-[rgb(var(--accent-color))]"
                          : "text-muted2 opacity-0 group-hover:opacity-100 hover:text-text",
                      )}
                      onClick={() => {
                        if (isComparing && compareState?.layout === "stack") {
                          onCompareChange?.(null);
                        } else {
                          onCompareChange?.({ afterPath: r.path, layout: "stack" });
                        }
                      }}
                      title="Compare top/bottom"
                    >
                      <Rows2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        ) : null}

        {repaintHistory.length > 0 ? (
          <CollapsibleSection label="Versions" border="border-t" collapsed={collapsedSections.has("versions")} onToggle={() => toggleSection("versions")}>
            <div className="space-y-0.5">
              {repaintHistory.map((h) => {
                const name = h.output_path.split("/").pop();
                const isComparing = compareState?.afterPath === h.output_path;
                const isExpanded = expandedHistoryId === h.asset_id;
                return (
                  <div key={h.asset_id}>
                    <div
                      className={cx(
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors",
                        isComparing ? "bg-[rgb(var(--accent-color)/0.12)] text-[rgb(var(--accent-color))]" : "text-muted hover:bg-hover hover:text-text",
                      )}
                    >
                      <button
                        type="button"
                        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted2"
                        onClick={() => setExpandedHistoryId(isExpanded ? null : h.asset_id)}
                      >
                        <ChevronDown className={cx("h-3 w-3 transition-transform", !isExpanded && "-rotate-90")} />
                      </button>
                      <span className="min-w-0 flex-1 truncate" title={h.output_path}>{name}</span>
                      <button
                        type="button"
                        className={cx(
                          "flex h-5 w-5 items-center justify-center rounded transition-colors",
                          isComparing && compareState?.layout !== "stack"
                            ? "text-[rgb(var(--accent-color))]"
                            : "text-muted2 opacity-0 group-hover:opacity-100 hover:text-text",
                        )}
                        onClick={() => {
                          if (isComparing && compareState?.layout !== "stack") {
                            onCompareChange?.(null);
                          } else {
                            onCompareChange?.({ afterPath: h.output_path, layout: "side" });
                          }
                        }}
                        title="Compare side-by-side"
                      >
                        <Columns2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className={cx(
                          "flex h-5 w-5 items-center justify-center rounded transition-colors",
                          isComparing && compareState?.layout === "stack"
                            ? "text-[rgb(var(--accent-color))]"
                            : "text-muted2 opacity-0 group-hover:opacity-100 hover:text-text",
                        )}
                        onClick={() => {
                          if (isComparing && compareState?.layout === "stack") {
                            onCompareChange?.(null);
                          } else {
                            onCompareChange?.({ afterPath: h.output_path, layout: "stack" });
                          }
                        }}
                        title="Compare top/bottom"
                      >
                        <Rows2 className="h-3 w-3" />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="ml-6 mt-1 mb-1.5 space-y-1 rounded-md bg-app px-2.5 py-2 text-[11px] leading-5 text-muted">
                        {h.prompt && <div><span className="text-muted2">Prompt: </span><span className="text-text">{h.prompt}</span></div>}
                        {h.provider && <div><span className="text-muted2">Provider: </span>{h.provider}{h.model ? ` / ${h.model}` : ""}</div>}
                        {h.temperature != null && <div><span className="text-muted2">Temperature: </span>{h.temperature}</div>}
                        {h.resolution && <div><span className="text-muted2">Resolution: </span>{h.resolution}</div>}
                        {h.aspect_ratio && <div><span className="text-muted2">Aspect ratio: </span>{h.aspect_ratio}</div>}
                        {h.created_at && <div><span className="text-muted2">Created: </span>{new Date(h.created_at + "Z").toLocaleString()}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        ) : null}

      </div>

      <div className="shrink-0 border-t border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <button
            type="button"
            className={cx(
              "inline-flex h-8 items-center justify-center rounded-md px-3 py-0 text-[12px] font-medium transition-colors",
              generateStatus.running
                ? "ai-generating-btn text-black"
                : providerConfigured && (isUpscaleModel || selectedStyle || customPrompt.trim())
                  ? "bg-[rgb(var(--accent-color))] text-black hover:brightness-110"
                  : "bg-[rgb(var(--accent-color)/0.18)] text-[rgb(var(--accent-color))]",
            )}
            disabled={generateStatus.running}
            onClick={queueApply}
          >
            <span className="inline-flex items-center gap-1.5">
              {generateStatus.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : providerConfigured && (isUpscaleModel || selectedStyle || customPrompt.trim()) ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generateStatus.running ? "Generating…" : "Generate"}
            </span>
          </button>
        </div>
        {generateStatus.error ? (
          <div
            className="mt-1.5 line-clamp-2 cursor-default text-[11px] leading-4 text-rose-300/80"
            title={generateStatus.error}
          >
            {generateStatus.error}
          </div>
        ) : null}
      </div>

      {editingStyleId ? (
        <EditStyleModal
          title={editingStyleId === "new" ? "New Style" : "Edit Style"}
          draft={styleDraft}
          onChange={setStyleDraft}
          onSave={saveStyleDraft}
          onClose={resetDraft}
        />
      ) : null}

      {showApiModal ? (
        <ConfigureApiModal
          providers={PROVIDERS}
          providerKey={modalProviderKey}
          tokenValue={tokenDraft}
          hasToken={Boolean(modalProviderConfig?.token)}
          onChangeProvider={setModalProviderKey}
          onChangeToken={setTokenDraft}
          onSave={saveToken}
          onRemove={removeToken}
          onClose={() => setShowApiModal(false)}
        />
      ) : null}
    </div>
  );
}
