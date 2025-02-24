import * as React from "react";
import { createRoot } from "react-dom/client";
import * as Tabs from "@radix-ui/react-tabs";
import * as Label from "@radix-ui/react-label";
import { ReloadIcon, ChevronDownIcon, MinusCircledIcon, StarFilledIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import Checkbox from "./components/Checkbox";
import Input from "./components/Input";
import "./ui.css";

interface RoundingOptions {
  detachInstances: boolean;
  roundEffects: boolean;
  roundVectors: boolean;
  preserveProportions: boolean;
  roundingStrategy: "round" | "floor" | "ceil";
  closeOnComplete: boolean;
  roundingFactorByProperty: {
    dimensions: number;
    fontSize: number;
    effects: number;
    vectors: number;
  };
}

interface Stats {
  nodesProcessed: number;
  propertiesRounded: number;
  instancesSkipped: number;
  errorCount: number;
}

interface PreviewChange {
  property: string;
  from: number;
  to: number;
}

interface NodeChange {
  name: string;
  type: string;
  changes: PreviewChange[];
}

interface PreviewChanges {
  nodeCount: number;
  propertyChanges: {
    [nodeId: string]: NodeChange;
  };
  instancesSkipped: number;
}

function App() {
  const [options, setOptions] = React.useState<RoundingOptions>({
    detachInstances: false,
    roundEffects: true,
    roundVectors: true,
    preserveProportions: true,
    roundingStrategy: "round",
    closeOnComplete: false,
    roundingFactorByProperty: {
      dimensions: 8,
      fontSize: 2,
      effects: 1,
      vectors: 1,
    },
  });

  const [stats, setStats] = React.useState<Stats | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [selectionLoading, setSelectionLoading] = React.useState(false);
  const [documentLoading, setDocumentLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("main");
  const [previewChanges, setPreviewChanges] = React.useState<PreviewChanges | null>(null);

  // Add state for custom presets
  const [customPresets, setCustomPresets] = React.useState<number[]>([]);

  // Load saved settings on mount
  React.useEffect(() => {
    const loadSettings = () => {
      parent.postMessage({ pluginMessage: { type: "load-settings" } }, "*");
    };
    loadSettings();
  }, []);

  // Load custom presets on mount
  React.useEffect(() => {
    const loadCustomPresets = async () => {
      parent.postMessage({ pluginMessage: { type: "load-custom-presets" } }, "*");
    };
    loadCustomPresets();
  }, []);

  // Handle messages from the plugin
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage;

      switch (message.type) {
        case "preview-complete":
          setPreviewLoading(false);
          setStats(message.stats);
          setPreviewChanges(message.changes);
          break;
        case "apply-complete":
          setSelectionLoading(false);
          setDocumentLoading(false);
          setStats(message.stats);
          setPreviewChanges(null);
          break;
        case "preview-error":
          setPreviewLoading(false);
          setSelectionLoading(false);
          setDocumentLoading(false);
          console.error("Preview error:", message.error);
          figma.notify("Error whilst analysing changes: " + message.error);
          break;
        case "settings-loaded":
          setOptions(message.settings);
          break;
        case "custom-presets-loaded":
          setCustomPresets(message.presets || []);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Save settings whenever they change
  React.useEffect(() => {
    const saveSettings = () => {
      parent.postMessage({ pluginMessage: { type: "save-settings", settings: options } }, "*");
    };
    saveSettings();
  }, [options]);

  // Handle saving custom preset
  const handleSaveCustomPreset = () => {
    const currentValue = options.roundingFactorByProperty.dimensions;
    if (!customPresets.includes(currentValue)) {
      const newPresets = [...customPresets, currentValue].sort((a, b) => b - a);
      setCustomPresets(newPresets);
      parent.postMessage({ pluginMessage: { type: "save-custom-presets", presets: newPresets } }, "*");
    }
  };

  // Handle removing custom preset
  const handleRemovePreset = (preset: number) => {
    const newPresets = customPresets.filter((p) => p !== preset);
    setCustomPresets(newPresets);
    parent.postMessage({ pluginMessage: { type: "save-custom-presets", presets: newPresets } }, "*");
  };

  // Handle preset selection
  const handlePresetClick = (factor: number) => {
    setOptions((prev) => ({
      ...prev,
      roundingFactorByProperty: {
        dimensions: factor,
        fontSize: Math.max(1, factor / 4),
        effects: Math.max(1, factor / 8),
        vectors: Math.max(1, factor / 8),
      },
    }));
  };

  // Handle option changes
  const handleOptionChange = (key: keyof RoundingOptions, value: any) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleFactorChange = (key: keyof RoundingOptions["roundingFactorByProperty"], value: number) => {
    setOptions((prev) => ({
      ...prev,
      roundingFactorByProperty: {
        ...prev.roundingFactorByProperty,
        [key]: value,
      },
    }));
  };

  // Handle preview and apply actions
  const handlePreview = () => {
    setPreviewLoading(true);
    parent.postMessage(
      {
        pluginMessage: {
          type: "preview",
          options,
        },
      },
      "*"
    );
  };

  const handleApply = (selectionOnly: boolean) => {
    if (selectionOnly) {
      setSelectionLoading(true);
    } else {
      setDocumentLoading(true);
    }
    parent.postMessage(
      {
        pluginMessage: {
          type: selectionOnly ? "run" : "select-and-run",
          options,
          checkboxOn: options.closeOnComplete,
        },
      },
      "*"
    );
  };

  const formatChange = (value: number): string => {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  };

  return (
    <main className="w-full flex flex-col h-full">
      <Tabs.Root className="w-full flex flex-col flex-1" value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="TabsList w-full flex">
          <Tabs.Trigger value="main" className="w-full TabsTrigger">
            Main
          </Tabs.Trigger>
          <Tabs.Trigger value="settings" className="w-full TabsTrigger">
            Settings
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="main" className="TabsContent flex-1">
          <div className="content-with-footer">
            {/* Presets */}
            <section className="space-y-2">
              <Label.Root className="text-xs font-medium text-figma-primary">Presets</Label.Root>
              <div className="grid grid-cols-3 gap-2">
                {[...customPresets, 8, 4, 2].map((factor, index) => (
                  <div key={`preset-${factor}-${index}`} className="relative group">
                    <button
                      onClick={() => handlePresetClick(factor)}
                      className={`w-full px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                        ${options.roundingFactorByProperty.dimensions === factor ? "bg-[#18A0FB] text-white hover:bg-[#0D8DE3]" : "bg-[#F5F5F5] text-[#333333] hover:bg-[#E5E5E5]"}`}
                    >
                      {factor}px Grid
                    </button>
                    {customPresets.includes(factor) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePreset(factor);
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <MinusCircledIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Basic Options */}
            <section className="space-y-3">
              <Label.Root className="text-xs font-medium text-figma-primary">Basic Options</Label.Root>
              <div className="relative">
                <Input label="Rounding Factor" value={options.roundingFactorByProperty.dimensions} onChange={(e) => handleFactorChange("dimensions", Number(e.target.value))} min={1} step={1} placeholder="8" />
                <button onClick={handleSaveCustomPreset} className="absolute right-0 top-[19px] size-8 flex items-center justify-center text-figma-secondary hover:text-[#18A0FB] transition-colors" title="Save as preset">
                  <StarFilledIcon className="size-4" />
                </button>
              </div>
              <div className="relative">
                <select value={options.roundingStrategy} onChange={(e) => handleOptionChange("roundingStrategy", e.target.value as RoundingStrategy)} className="input appearance-none pr-8">
                  <option value="round">Round</option>
                  <option value="floor">Floor</option>
                  <option value="ceil">Ceiling</option>
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-figma-secondary">
                  <ChevronDownIcon className="w-4 h-4" />
                </div>
              </div>
            </section>

            {/* Stats */}
            {stats && (
              <section className="stats-panel">
                <div className="stats-row">
                  <span className="stats-label">Nodes Processed:</span>
                  <span className="stats-value">{stats.nodesProcessed}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Properties Rounded:</span>
                  <span className="stats-value">{stats.propertiesRounded}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Instances Skipped:</span>
                  <span className="stats-value">{stats.instancesSkipped}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Errors:</span>
                  <span className="stats-value">{stats.errorCount}</span>
                </div>
              </section>
            )}
          </div>
        </Tabs.Content>

        <Tabs.Content value="settings" className="TabsContent flex-1">
          <div className="content-with-footer">
            {/* Advanced Options */}
            <section className="space-y-3">
              <Label.Root className="text-xs font-medium text-figma-primary">Property-Specific Factors</Label.Root>
              <Input label="Font Size Factor" value={options.roundingFactorByProperty.fontSize} onChange={(e) => handleFactorChange("fontSize", Number(e.target.value))} min={1} step={1} placeholder="2" />
              <Input label="Effects Factor" value={options.roundingFactorByProperty.effects} onChange={(e) => handleFactorChange("effects", Number(e.target.value))} min={1} step={1} placeholder="1" />
              <Input label="Vector Factor" value={options.roundingFactorByProperty.vectors} onChange={(e) => handleFactorChange("vectors", Number(e.target.value))} min={1} step={1} placeholder="1" />
            </section>

            {/* Behavior Options */}
            <section className="space-y-3">
              <Label.Root className="text-xs font-medium text-figma-primary">Behavior Options</Label.Root>
              <div className="space-y-2">
                <Checkbox label="Preserve Proportions" checked={options.preserveProportions} onChange={(checked) => handleOptionChange("preserveProportions", checked)} />
                <Checkbox label="Round Effects" checked={options.roundEffects} onChange={(checked) => handleOptionChange("roundEffects", checked)} />
                <Checkbox label="Round Vectors" checked={options.roundVectors} onChange={(checked) => handleOptionChange("roundVectors", checked)} />
                <Checkbox label="Detach Instances" checked={options.detachInstances} onChange={(checked) => handleOptionChange("detachInstances", checked)} />
                <Checkbox label="Close plugin on completion" checked={options.closeOnComplete} onChange={(checked) => handleOptionChange("closeOnComplete", checked)} />
              </div>
            </section>
          </div>
        </Tabs.Content>
      </Tabs.Root>

      {/* Action Buttons */}
      <div className="action-buttons-container">
        <button
          onClick={handlePreview}
          disabled={previewLoading || selectionLoading || documentLoading}
          className="w-full h-10 px-4 text-sm font-medium rounded-md transition-colors
            bg-figma-secondaryBg text-figma-primary hover:bg-figma-bg-selected disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {previewLoading ? (
            <>
              <ReloadIcon className="animate-spin w-3 h-3" />
              <span>Analysing Changes...</span>
            </>
          ) : (
            "Preview Changes"
          )}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => handleApply(true)}
            disabled={previewLoading || selectionLoading || documentLoading}
            className="flex-1 h-10 px-4 text-sm font-medium rounded-md transition-colors
              bg-[#18A0FB] text-white hover:bg-[#0D8DE3] disabled:opacity-50"
          >
            {selectionLoading ? (
              <span className="flex items-center justify-center gap-2">
                <LightningBoltIcon className="w-3 h-3" />
                <span>Applying...</span>
              </span>
            ) : (
              "Round Selection"
            )}
          </button>
          <button
            onClick={() => handleApply(false)}
            disabled={previewLoading || selectionLoading || documentLoading}
            className="flex-1 h-10 px-4 text-sm font-medium rounded-md transition-colors
              bg-[#18A0FB] text-white hover:bg-[#0D8DE3] disabled:opacity-50"
          >
            {documentLoading ? (
              <span className="flex items-center justify-center gap-2">
                <LightningBoltIcon className="w-3 h-3" />
                <span>Applying...</span>
              </span>
            ) : (
              "Round Document"
            )}
          </button>
        </div>
      </div>

      {/* Preview Changes */}
      {previewChanges && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-figma-divider">
              <h2 className="text-sm font-medium text-figma-primary">Preview Changes</h2>
              <p className="text-xs text-figma-secondary mt-1">
                {Object.keys(previewChanges.propertyChanges).length} nodes will be modified
                {previewChanges.instancesSkipped > 0 && ` (${previewChanges.instancesSkipped} instances skipped)`}
              </p>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {Object.keys(previewChanges.propertyChanges).map((nodeId) => {
                const node = previewChanges.propertyChanges[nodeId];
                return (
                  <div key={nodeId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-figma-primary">{node.name}</span>
                      <span className="text-xs text-figma-secondary">{node.type}</span>
                    </div>
                    <div className="space-y-1">
                      {node.changes.map((change, index) => (
                        <div key={index} className="text-xs flex items-center justify-between">
                          <span className="text-figma-secondary">{change.property}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-figma-secondary">{formatChange(change.from)}</span>
                            <span className="text-figma-secondary">→</span>
                            <span className="text-figma-primary font-medium">{formatChange(change.to)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-[#E5E5E5] flex justify-end space-x-2">
              <button
                onClick={() => setPreviewChanges(null)}
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                  bg-[#F5F5F5] text-[#333333] hover:bg-[#E5E5E5]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const isSelectionOnly = previewChanges!.nodeCount === Object.keys(previewChanges!.propertyChanges).length;
                  handleApply(isSelectionOnly);
                  setPreviewChanges(null);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                  bg-[#18A0FB] text-white hover:bg-[#0D8DE3]"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {(previewLoading || selectionLoading || documentLoading) && (
        <div className="progress-bar">
          <div className="progress-bar-indicator w-1/2"></div>
        </div>
      )}
    </main>
  );
}

const root = createRoot(document.getElementById("react-page")!);
root.render(<App />);
