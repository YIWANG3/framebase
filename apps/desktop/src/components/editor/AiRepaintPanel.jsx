import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  Check,
  Columns2,
  KeyRound,
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
            <PanelLabel>API Token</PanelLabel>
          </div>
          <div className="mt-2 flex h-8 items-center gap-2 rounded-md border border-border/70 bg-app px-2 hover:border-border focus-within:border-accent/50">
            <KeyRound className="h-3.5 w-3.5 text-muted2" />
            <input
              value={tokenValue}
              onChange={(event) => onChangeToken(event.target.value)}
              placeholder="nb_live_xxx..."
              className="h-full flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-muted2"
            />
          </div>
          <div className="mt-2 text-[11px] text-muted">{hasToken ? "Token saved locally in mock state." : "Required before Apply."}</div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            className={ACCENT_BUTTON}
            onClick={onSave}
          >
            Save token
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

export default function AiRepaintPanel({ sourcePath, sourceLabel = "Current image", onCompareChange, compareState }) {
  const repaintPollRef = useRef(null);
  const [activeProviderKey, setActiveProviderKey] = useState(null);
  const [providerConfigs, setProviderConfigs] = useState({});
  const [modalProviderKey, setModalProviderKey] = useState(PROVIDERS[0].key);
  const [styles, setStyles] = useState(INITIAL_STYLES);
  const [selectedStyleId, setSelectedStyleId] = useState(INITIAL_STYLES[0]?.id ?? null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [showApiModal, setShowApiModal] = useState(false);
  const [editingStyleId, setEditingStyleId] = useState(null);
  const [styleDraft, setStyleDraft] = useState({ name: "", prompt: "" });
  const [temperature, setTemperature] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [resolution, setResolution] = useState("4k");
  const [compactStyles, setCompactStyles] = useState(false);
  const [generateStatus, setGenerateStatus] = useState({ running: false, status: null, error: null });
  const [results, setResults] = useState([]);

  const provider = useMemo(
    () => PROVIDERS.find((entry) => entry.key === activeProviderKey) || null,
    [activeProviderKey],
  );
  const selectedStyle = useMemo(
    () => styles.find((entry) => entry.id === selectedStyleId) || null,
    [styles, selectedStyleId],
  );
  const providerConfig = activeProviderKey ? providerConfigs[activeProviderKey] || null : null;
  const providerConfigured = Boolean(providerConfig?.token);
  const modalProviderConfig = providerConfigs[modalProviderKey] || null;

  useEffect(() => {
    async function loadStored() {
      const providerKey = PROVIDERS[0].key;
      const payload = await window.mediaWorkspace?.getAiProviderToken?.(providerKey);
      if (payload?.token) {
        setProviderConfigs((current) => ({ ...current, [providerKey]: payload }));
        setActiveProviderKey(providerKey);
      }
      const saved = await window.mediaWorkspace?.getAiStyles?.();
      if (Array.isArray(saved) && saved.length) {
        setStyles(saved);
        setSelectedStyleId((current) => {
          if (current && saved.some((s) => s.id === current)) return current;
          return saved[0]?.id ?? null;
        });
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
    const nextToken = tokenDraft.trim();
    if (!nextToken) return;
    void (async () => {
      const payload = await window.mediaWorkspace?.setAiProviderToken?.(modalProviderKey, nextToken);
      setProviderConfigs((current) => ({
        ...current,
        [modalProviderKey]: payload?.token ? payload : { token: nextToken },
      }));
      setActiveProviderKey(modalProviderKey);
      setShowApiModal(false);
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
      setActiveProviderKey((current) => (current === modalProviderKey ? null : current));
    })();
  }

  function queueApply() {
    if (!selectedStyle) return;
    if (!providerConfigured) {
      setShowApiModal(true);
      return;
    }
    if (!sourcePath) return;
    void (async () => {
      const task = await window.mediaWorkspace?.startAiRepaint?.({
        provider: activeProviderKey || PROVIDERS[0].key,
        sourcePath,
        prompt: selectedStyle.prompt,
        aspectRatio: aspectRatio === "auto" ? null : aspectRatio,
        resolution,
        temperature,
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
    <>
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
        <div className="border-b border-border/60 px-4 py-3">
          <PanelLabel>Provider</PanelLabel>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-border/70 bg-app px-3">
              <div className="text-[12px] font-medium text-text">{provider?.label || "No provider added"}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-app text-text transition-colors hover:border-border hover:bg-hover"
              onClick={() => setShowApiModal(true)}
              title="Add provider"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="border-b border-border/60 px-4 py-3">
          <PanelLabel>Parameters</PanelLabel>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-text">Temperature</div>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
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
              onChange={(event) => setTemperature(Number(event.target.value))}
              className="mt-3 w-full"
              aria-label="Temperature"
            />
          </div>

          <div className="mt-4">
            <div className="text-[12px] text-text">Aspect ratio</div>
            <select
              value={aspectRatio}
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
        </div>

        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <PanelLabel>My Styles</PanelLabel>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  compactStyles ? "text-muted2 hover:bg-hover hover:text-text" : "bg-hover text-text",
                )}
                onClick={() => setCompactStyles(false)}
                title="Expanded view"
              >
                <StretchHorizontal className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  compactStyles ? "bg-hover text-text" : "text-muted2 hover:bg-hover hover:text-text",
                )}
                onClick={() => setCompactStyles(true)}
                title="Compact view"
              >
                <AlignJustify className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-app text-text transition-colors hover:border-border hover:bg-hover"
                onClick={openCreateStyle}
                title="New style"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className={cx("mt-3", compactStyles ? "space-y-0.5" : "space-y-2")}>
            {styles.map((style) => compactStyles ? (
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

        </div>

        {results.length > 0 ? (
          <div className="border-t border-border/60 px-4 py-3">
            <PanelLabel>Results</PanelLabel>
            <div className="mt-2 space-y-1">
              {results.map((r, i) => {
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
          </div>
        ) : null}

      </div>

      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        {generateStatus.error ? <div className="text-[11px] text-rose-300">{generateStatus.error}</div> : null}
        <div className="flex-1" />
        <button
          type="button"
          className={cx(
            "inline-flex h-8 items-center justify-center rounded-md px-3 py-0 text-[12px] font-medium transition-colors",
            providerConfigured && selectedStyle
              ? "bg-[rgb(var(--accent-color))] text-black hover:brightness-110"
              : "bg-[rgb(var(--accent-color)/0.18)] text-[rgb(var(--accent-color))]",
          )}
          onClick={queueApply}
        >
          <span className="inline-flex items-center gap-1.5">
            {generateStatus.running ? <Sparkles className="h-3.5 w-3.5" /> : providerConfigured && selectedStyle ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generateStatus.running ? "Generating" : "Generate"}
          </span>
        </button>
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
    </>
  );
}
