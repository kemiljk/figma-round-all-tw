/// <reference types="@figma/plugin-typings" />

// Types and interfaces
type RoundingStrategy = "round" | "floor" | "ceil";

interface RoundingOptions {
  detachInstances: boolean;
  roundEffects: boolean;
  roundVectors: boolean;
  preserveProportions: boolean;
  roundingStrategy: RoundingStrategy;
  ignoreTypes?: string[];
  roundingFactorByProperty: {
    dimensions: number;
    fontSize: number;
    effects: number;
    vectors: number;
    lineHeight: number;
    cornerRadius: number;
    [key: string]: number;
  };
}

interface RoundingStats {
  nodesProcessed: number;
  propertiesRounded: number;
  instancesSkipped: number;
  errorCount: number;
  modifiedProperties: Set<string>;
}

// Set to track processed nodes and prevent infinite recursion
const processedNodes = new Set<string>();

// Default options
const DEFAULT_OPTIONS: RoundingOptions = {
  detachInstances: false,
  roundEffects: true,
  roundVectors: true,
  preserveProportions: true,
  roundingStrategy: "round",
  ignoreTypes: ["GROUP"],
  roundingFactorByProperty: {
    dimensions: 1,
    fontSize: 1,
    effects: 1,
    vectors: 1,
    lineHeight: 1,
    cornerRadius: 1,
  },
};

// Show a larger UI to accommodate new features
figma.showUI(__html__, {
  themeColors: true,
  width: 320,
  height: 460,
});

// Properties that can be rounded across different node types
const propertiesToRound = [
  // Layout properties
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "itemSpacing",
  "counterAxisSpacing",
  "horizontalPadding",
  "verticalPadding",
  "layoutGrids",
  "gridStyleId",

  // Visual properties
  "opacity",
  "strokeWeight",
  "strokeTopWeight",
  "strokeBottomWeight",
  "strokeLeftWeight",
  "strokeRightWeight",
  "cornerRadius",
  "topLeftRadius",
  "topRightRadius",
  "bottomLeftRadius",
  "bottomRightRadius",
  "dashPattern", // Array of numbers for stroke dash pattern

  // Effects and Blends
  "effectStyleId",
  "blendMode",

  // Grid properties
  "layoutGrids", // Array of LayoutGrid which can have numeric values

  // Export settings
  "exportSettings", // Can have numeric values for constraints

  // Component properties
  "componentPropertyDefinitions", // Can have numeric default values

  // Vector properties
  "vectorNetwork", // Can have numeric coordinates
  "vectorPaths", // Can have numeric path data

  // Table properties
  "cellSize",
  "cellSpacing",

  // Star specific
  "pointCount",
  "innerRadius",
];

// Message handling
figma.ui.onmessage = async (msg) => {
  const stats: RoundingStats = {
    nodesProcessed: 0,
    propertiesRounded: 0,
    instancesSkipped: 0,
    errorCount: 0,
    modifiedProperties: new Set(),
  };

  try {
    switch (msg.type) {
      case "save-settings":
        await figma.clientStorage.setAsync("roundingSettings", msg.settings);
        break;

      case "load-settings":
        const savedSettings = await figma.clientStorage.getAsync("roundingSettings");
        if (savedSettings) {
          figma.ui.postMessage({ type: "settings-loaded", settings: savedSettings });
        }
        break;

      case "preview":
        // Preview mode - calculate and return what would be changed
        const hasSelection = figma.currentPage.selection.length > 0;
        const previewChanges = await previewRoundingChanges(
          msg.options.roundingFactorByProperty.dimensions,
          msg.options,
          hasSelection // Pass true if there's a selection, which will make it only preview selected nodes
        );
        figma.ui.postMessage({ type: "preview-complete", changes: previewChanges });
        break;

      case "select-and-run":
        if (msg.preview) {
          const previewChanges = await previewRoundingChanges(msg.roundingFactor, msg.options || DEFAULT_OPTIONS);
          figma.ui.postMessage({ type: "preview-results", changes: previewChanges });
        } else {
          await roundPixels(msg.roundingFactor, msg.options || DEFAULT_OPTIONS, stats, msg.excludedNodes || []);
          figma.ui.postMessage({ type: "apply-complete", stats });
          figma.notify(`All cleaned up! Processed ${stats.nodesProcessed} nodes, rounded ${stats.propertiesRounded} properties`);
        }
        break;

      case "run":
        if (msg.preview) {
          const previewChanges = await previewRoundingChanges(msg.roundingFactor, msg.options || DEFAULT_OPTIONS, true);
          figma.ui.postMessage({ type: "preview-results", changes: previewChanges });
        } else {
          await selectAndRoundType(msg.roundingFactor, msg.options || DEFAULT_OPTIONS, stats, msg.excludedNodes || []);
          figma.ui.postMessage({ type: "apply-complete", stats });
          figma.notify(`Selection cleaned up! Processed ${stats.nodesProcessed} nodes, rounded ${stats.propertiesRounded} properties`);
        }
        break;

      case "save-preset":
        // Save current settings as a preset
        figma.clientStorage.setAsync(`preset-${msg.presetName}`, {
          roundingFactor: msg.roundingFactor,
          options: msg.options,
        });
        break;

      case "load-preset":
        // Load a saved preset
        const preset = await figma.clientStorage.getAsync(`preset-${msg.presetName}`);
        if (preset) {
          figma.ui.postMessage({ type: "preset-loaded", preset });
        }
        break;

      case "load-custom-presets":
        const savedPresets = await figma.clientStorage.getAsync("customPresets");
        figma.ui.postMessage({ type: "custom-presets-loaded", presets: savedPresets || [] });
        break;

      case "save-custom-presets":
        await figma.clientStorage.setAsync("customPresets", msg.presets);
        break;

      case "highlight-node":
        // Remove any existing highlight
        const existingHighlight = figma.currentPage.findChild((node) => node.name === "Temporary Highlight");
        if (existingHighlight) {
          existingHighlight.remove();
        }

        const nodeToHighlight = await figma.getNodeByIdAsync(msg.nodeId);
        if (nodeToHighlight) {
          try {
            // Create a temporary highlight rectangle
            const highlightRect = figma.createRectangle();
            highlightRect.name = "Temporary Highlight";

            // Get the absolute position and dimensions
            let bounds;
            if (nodeToHighlight.type === "GROUP") {
              // For groups, get the union of all children's bounds
              const group = nodeToHighlight as GroupNode;
              let minX = Infinity,
                minY = Infinity;
              let maxX = -Infinity,
                maxY = -Infinity;

              const processNode = (node: SceneNode) => {
                if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
                  const box = node.absoluteBoundingBox;
                  minX = Math.min(minX, box.x);
                  minY = Math.min(minY, box.y);
                  maxX = Math.max(maxX, box.x + box.width);
                  maxY = Math.max(maxY, box.y + box.height);
                }
                if ("children" in node) {
                  node.children.forEach(processNode);
                }
              };

              processNode(group);
              bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            } else if ("absoluteBoundingBox" in nodeToHighlight && nodeToHighlight.absoluteBoundingBox) {
              // For other nodes, use their absolute bounding box
              bounds = nodeToHighlight.absoluteBoundingBox;
            }

            if (bounds) {
              // Position and size the highlight
              highlightRect.x = bounds.x;
              highlightRect.y = bounds.y;
              highlightRect.resize(bounds.width, bounds.height);

              // Style the highlight
              highlightRect.fills = [
                {
                  type: "SOLID",
                  color: { r: 1, g: 0.847, b: 0 }, // Figma's yellow highlight color
                  opacity: 0.3,
                },
              ];

              // Add to the page at the top level
              figma.currentPage.appendChild(highlightRect);

              // Lock the highlight to prevent interaction
              highlightRect.locked = true;

              // Zoom to the node
              figma.viewport.scrollAndZoomIntoView([nodeToHighlight]);
            }
          } catch (e) {
            console.error("Error highlighting node:", e);
            // If highlighting fails, just zoom to the node
            figma.viewport.scrollAndZoomIntoView([nodeToHighlight]);
          }
        }
        break;

      case "remove-highlight":
        const highlightToRemove = figma.currentPage.findChild((node) => node.name === "Temporary Highlight");
        if (highlightToRemove) {
          highlightToRemove.remove();
        }
        break;
    }

    if (msg.checkboxOn) {
      figma.closePlugin();
    }
  } catch (error) {
    console.error("Error in message handling:", error);
    figma.notify("An error occurred while processing");
  }
};

// Helper function to safely get children of a node
function getChildren(node: SceneNode): SceneNode[] {
  if ("children" in node) {
    return [...node.children];
  }
  return [];
}

// Helper functions for rounding strategies
function applyRoundingStrategy(value: number, factor: number, strategy: RoundingStrategy = "round"): number {
  // Handle edge cases
  if (factor <= 0) return value;
  if (value === 0) return 0;

  // For very small values, preserve them
  if (Math.abs(value) < 0.001) return value;

  // Use more precise calculation to avoid floating point errors
  const scaled = value / factor;
  let result;

  switch (strategy) {
    case "floor":
      result = Math.floor(scaled) * factor;
      break;
    case "ceil":
      result = Math.ceil(scaled) * factor;
      break;
    case "round":
    default:
      // Use a more precise rounding approach
      // This helps with cases like 60.48 becoming 59
      const rounded = Math.round(scaled * 1000000) / 1000000;
      result = Math.round(rounded) * factor;
      break;
  }

  // Prevent rounding errors by cleaning up the result
  // This ensures values like 10.5 don't become 10 due to floating point precision
  return Number(result.toFixed(10));
}

// Helper function to preserve proportions when rounding dimensions
function preserveProportions(width: number, height: number, factor: number, strategy: RoundingStrategy = "round"): [number, number] {
  const aspectRatio = width / height;
  const newWidth = applyRoundingStrategy(width, factor, strategy);
  const newHeight = applyRoundingStrategy(height, factor, strategy);

  // If rounding would change aspect ratio significantly, adjust to maintain it
  const newRatio = newWidth / newHeight;
  const ratioChange = Math.abs(newRatio - aspectRatio) / aspectRatio;

  if (ratioChange > 0.01) {
    // 1% threshold for aspect ratio change
    // Try to maintain original ratio by adjusting height based on rounded width
    const heightFromWidth = newWidth / aspectRatio;
    const heightRounded = applyRoundingStrategy(heightFromWidth, factor, strategy);

    // Or adjust width based on rounded height
    const widthFromHeight = newHeight * aspectRatio;
    const widthRounded = applyRoundingStrategy(widthFromHeight, factor, strategy);

    // Choose the combination that preserves the aspect ratio better
    const ratio1 = Math.abs(newWidth / heightRounded - aspectRatio);
    const ratio2 = Math.abs(widthRounded / newHeight - aspectRatio);

    return ratio1 < ratio2 ? [newWidth, heightRounded] : [widthRounded, newHeight];
  }

  return [newWidth, newHeight];
}

// Helper function to round deep values in objects
function roundDeepValues(obj: any, factor: number, strategy: RoundingStrategy = "round"): any {
  if (typeof obj === "number") {
    return applyRoundingStrategy(obj, factor, strategy);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => roundDeepValues(item, factor, strategy));
  }

  if (obj && typeof obj === "object") {
    const result: any = {};
    const values = Object.keys(obj).map((key) => obj[key]);
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = roundDeepValues(obj[key], factor, strategy);
      }
    }
    return result;
  }

  return obj;
}

// Preview changes without applying them
async function previewRoundingChanges(roundingFactor: number, options: RoundingOptions, selectionOnly: boolean = false): Promise<any> {
  const changes: {
    nodeCount: number;
    propertyChanges: {
      [nodeId: string]: {
        name: string;
        type: string;
        changes: {
          property: string;
          from: number;
          to: number;
        }[];
      };
    };
    instancesSkipped: number;
  } = {
    nodeCount: 0,
    propertyChanges: {},
    instancesSkipped: 0,
  };

  const previewNode = async (node: SceneNode) => {
    changes.nodeCount++;

    // Skip ignored node types
    if (options.ignoreTypes && options.ignoreTypes.indexOf(node.type) !== -1) {
      return;
    }

    // Skip instances if not detaching
    if (node.type === "INSTANCE" && !options.detachInstances) {
      changes.instancesSkipped++;
      return;
    }

    // Initialize node changes
    if (!changes.propertyChanges[node.id]) {
      changes.propertyChanges[node.id] = {
        name: node.name,
        type: node.type,
        changes: [],
      };
    }

    // Preview basic properties
    if ("x" in node) {
      const newX = applyRoundingStrategy(node.x, roundingFactor, options.roundingStrategy);
      if (newX !== node.x) {
        changes.propertyChanges[node.id].changes.push({
          property: "x",
          from: node.x,
          to: newX,
        });
      }
    }
    if ("y" in node) {
      const newY = applyRoundingStrategy(node.y, roundingFactor, options.roundingStrategy);
      if (newY !== node.y) {
        changes.propertyChanges[node.id].changes.push({
          property: "y",
          from: node.y,
          to: newY,
        });
      }
    }

    // Preview size properties
    if ("width" in node && "height" in node) {
      if (options.preserveProportions) {
        const [newWidth, newHeight] = preserveProportions(node.width, node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
        if (newWidth !== node.width) {
          changes.propertyChanges[node.id].changes.push({
            property: "width",
            from: node.width,
            to: newWidth,
          });
        }
        if (newHeight !== node.height) {
          changes.propertyChanges[node.id].changes.push({
            property: "height",
            from: node.height,
            to: newHeight,
          });
        }
      } else {
        const newWidth = applyRoundingStrategy(node.width, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
        const newHeight = applyRoundingStrategy(node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
        if (newWidth !== node.width) {
          changes.propertyChanges[node.id].changes.push({
            property: "width",
            from: node.width,
            to: newWidth,
          });
        }
        if (newHeight !== node.height) {
          changes.propertyChanges[node.id].changes.push({
            property: "height",
            from: node.height,
            to: newHeight,
          });
        }
      }
    }

    // Preview text properties
    if (node.type === "TEXT") {
      if (typeof node.fontSize === "number") {
        const newSize = applyRoundingStrategy(node.fontSize, options.roundingFactorByProperty.fontSize, options.roundingStrategy);
        if (newSize !== node.fontSize) {
          changes.propertyChanges[node.id].changes.push({
            property: "fontSize",
            from: node.fontSize,
            to: newSize,
          });
        }
      }

      // Preview line height
      if (node.lineHeight && typeof node.lineHeight !== "symbol") {
        if (node.lineHeight.unit === "PIXELS" && typeof node.lineHeight.value === "number") {
          const newLineHeight = applyRoundingStrategy(node.lineHeight.value, options.roundingFactorByProperty.lineHeight || 1, options.roundingStrategy);
          if (newLineHeight !== node.lineHeight.value) {
            changes.propertyChanges[node.id].changes.push({
              property: "lineHeight",
              from: node.lineHeight.value,
              to: newLineHeight,
            });
          }
        } else if (node.lineHeight.unit === "PERCENT" && typeof node.lineHeight.value === "number") {
          const newLineHeight = applyRoundingStrategy(node.lineHeight.value, options.roundingFactorByProperty.lineHeight || 1, options.roundingStrategy);
          if (newLineHeight !== node.lineHeight.value) {
            changes.propertyChanges[node.id].changes.push({
              property: "lineHeight (%)",
              from: node.lineHeight.value,
              to: newLineHeight,
            });
          }
        }
      }

      // Preview letter spacing
      if (node.letterSpacing && typeof node.letterSpacing !== "symbol") {
        if (node.letterSpacing.unit === "PIXELS" && typeof node.letterSpacing.value === "number") {
          const newLetterSpacing = applyRoundingStrategy(node.letterSpacing.value, options.roundingFactorByProperty.fontSize || 1, options.roundingStrategy);
          if (newLetterSpacing !== node.letterSpacing.value) {
            changes.propertyChanges[node.id].changes.push({
              property: "letterSpacing",
              from: node.letterSpacing.value,
              to: newLetterSpacing,
            });
          }
        } else if (node.letterSpacing.unit === "PERCENT" && typeof node.letterSpacing.value === "number") {
          const newLetterSpacing = applyRoundingStrategy(node.letterSpacing.value, options.roundingFactorByProperty.fontSize || 1, options.roundingStrategy);
          if (newLetterSpacing !== node.letterSpacing.value) {
            changes.propertyChanges[node.id].changes.push({
              property: "letterSpacing (%)",
              from: node.letterSpacing.value,
              to: newLetterSpacing,
            });
          }
        }
      }
    }

    // Preview effects if enabled
    if (options.roundEffects && "effects" in node && Array.isArray(node.effects)) {
      node.effects.forEach((effect: Effect, index: number) => {
        if ("radius" in effect) {
          const newRadius = applyRoundingStrategy(effect.radius, options.roundingFactorByProperty.effects, options.roundingStrategy);
          if (newRadius !== effect.radius) {
            changes.propertyChanges[node.id].changes.push({
              property: `effect[${index}].radius`,
              from: effect.radius,
              to: newRadius,
            });
          }
        }
      });
    }

    // Preview corner radius
    if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
      const newRadius = applyRoundingStrategy(node.cornerRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.cornerRadius) {
        changes.propertyChanges[node.id].changes.push({
          property: "cornerRadius",
          from: node.cornerRadius,
          to: newRadius,
        });
      }
    }

    // Preview individual corner radii
    if ("topLeftRadius" in node && typeof node.topLeftRadius === "number") {
      const newRadius = applyRoundingStrategy(node.topLeftRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.topLeftRadius) {
        changes.propertyChanges[node.id].changes.push({
          property: "topLeftRadius",
          from: node.topLeftRadius,
          to: newRadius,
        });
      }
    }

    if ("topRightRadius" in node && typeof node.topRightRadius === "number") {
      const newRadius = applyRoundingStrategy(node.topRightRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.topRightRadius) {
        changes.propertyChanges[node.id].changes.push({
          property: "topRightRadius",
          from: node.topRightRadius,
          to: newRadius,
        });
      }
    }

    if ("bottomLeftRadius" in node && typeof node.bottomLeftRadius === "number") {
      const newRadius = applyRoundingStrategy(node.bottomLeftRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.bottomLeftRadius) {
        changes.propertyChanges[node.id].changes.push({
          property: "bottomLeftRadius",
          from: node.bottomLeftRadius,
          to: newRadius,
        });
      }
    }

    if ("bottomRightRadius" in node && typeof node.bottomRightRadius === "number") {
      const newRadius = applyRoundingStrategy(node.bottomRightRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.bottomRightRadius) {
        changes.propertyChanges[node.id].changes.push({
          property: "bottomRightRadius",
          from: node.bottomRightRadius,
          to: newRadius,
        });
      }
    }

    // Recursively preview children
    if ("children" in node) {
      for (const child of node.children) {
        await previewNode(child);
      }
    }
  };

  try {
    if (selectionOnly) {
      const selection = figma.currentPage.selection;
      for (const node of selection) {
        await previewNode(node);
      }
    } else {
      const allNodes = figma.currentPage.findAll();
      for (const node of allNodes) {
        await previewNode(node);
      }
    }

    // Remove nodes with no changes
    Object.keys(changes.propertyChanges).forEach((nodeId) => {
      if (changes.propertyChanges[nodeId].changes.length === 0) {
        delete changes.propertyChanges[nodeId];
      }
    });

    figma.ui.postMessage({
      type: "preview-complete",
      changes,
      stats: {
        nodesProcessed: changes.nodeCount,
        propertiesRounded: Object.values(changes.propertyChanges).reduce((acc, node) => acc + node.changes.length, 0),
        instancesSkipped: changes.instancesSkipped,
        errorCount: 0,
      },
    });

    return changes;
  } catch (error) {
    console.error("Error in preview:", error);
    figma.ui.postMessage({
      type: "preview-error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// Update processNodeProperties to use the new options
async function processNodeProperties(node: SceneNode, roundingFactor: number, options: RoundingOptions, stats: RoundingStats) {
  try {
    // Skip ignored node types with warning for groups
    if (options.ignoreTypes && options.ignoreTypes.indexOf(node.type) !== -1) {
      if (node.type === "GROUP") {
        console.log(`Skipping group "${node.name}" - Groups are excluded by default to prevent scaling issues with children`);
      }
      return;
    }

    // Track stats
    stats.nodesProcessed++;

    // Check if node has auto layout
    const hasAutoLayout = "layoutMode" in node && node.layoutMode !== "NONE";

    // Basic properties that most nodes have
    if ("x" in node) {
      const newX = applyRoundingStrategy(node.x, roundingFactor, options.roundingStrategy);
      if (newX !== node.x) {
        node.x = newX;
        stats.propertiesRounded++;
        stats.modifiedProperties.add("x");
      }
    }
    if ("y" in node) {
      const newY = applyRoundingStrategy(node.y, roundingFactor, options.roundingStrategy);
      if (newY !== node.y) {
        node.y = newY;
        stats.propertiesRounded++;
        stats.modifiedProperties.add("y");
      }
    }

    // Size properties with proportion preservation
    if ("resize" in node && "width" in node && "height" in node) {
      // For text nodes, respect text auto-sizing settings
      if (node.type === "TEXT") {
        const textNode = node as TextNode;
        // Only modify width if it's not in auto-width mode
        if (!textNode.autoRename && textNode.textAutoResize !== "WIDTH_AND_HEIGHT" && textNode.textAutoResize !== "HEIGHT") {
          const newWidth = applyRoundingStrategy(node.width, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newWidth !== node.width) {
            node.resize(newWidth, node.height);
            stats.propertiesRounded++;
            stats.modifiedProperties.add("width");
          }
        }
        // Only modify height if it's in fixed height mode
        if (textNode.textAutoResize === "NONE") {
          const newHeight = applyRoundingStrategy(node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newHeight !== node.height) {
            node.resize(node.width, newHeight);
            stats.propertiesRounded++;
            stats.modifiedProperties.add("height");
          }
        }
      }
      // For auto layout containers, only modify fixed dimensions
      else if (hasAutoLayout) {
        const frame = node as FrameNode;
        if (frame.primaryAxisSizingMode === "FIXED" && frame.layoutMode === "HORIZONTAL") {
          const newWidth = applyRoundingStrategy(node.width, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newWidth !== node.width) {
            node.resize(newWidth, node.height);
            stats.propertiesRounded++;
            stats.modifiedProperties.add("width");
          }
        }
        if (frame.counterAxisSizingMode === "FIXED" && frame.layoutMode === "HORIZONTAL") {
          const newHeight = applyRoundingStrategy(node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newHeight !== node.height) {
            node.resize(node.width, newHeight);
            stats.propertiesRounded++;
            stats.modifiedProperties.add("height");
          }
        }
        if (frame.primaryAxisSizingMode === "FIXED" && frame.layoutMode === "VERTICAL") {
          const newHeight = applyRoundingStrategy(node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newHeight !== node.height) {
            node.resize(node.width, newHeight);
            stats.propertiesRounded++;
            stats.modifiedProperties.add("height");
          }
        }
        if (frame.counterAxisSizingMode === "FIXED" && frame.layoutMode === "VERTICAL") {
          const newWidth = applyRoundingStrategy(node.width, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newWidth !== node.width) {
            node.resize(newWidth, node.height);
            stats.propertiesRounded++;
            stats.modifiedProperties.add("width");
          }
        }
      } else {
        // For non-auto layout nodes, proceed with normal resizing
        if (options.preserveProportions) {
          const [newWidth, newHeight] = preserveProportions(node.width, node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newWidth !== node.width || newHeight !== node.height) {
            node.resize(newWidth, newHeight);
            stats.propertiesRounded += 2;
            stats.modifiedProperties.add("dimensions");
          }
        } else {
          const newWidth = applyRoundingStrategy(node.width, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          const newHeight = applyRoundingStrategy(node.height, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newWidth !== node.width || newHeight !== node.height) {
            node.resize(newWidth, newHeight);
            stats.propertiesRounded += 2;
            stats.modifiedProperties.add("dimensions");
          }
        }
      }
    }

    // Auto layout specific properties
    if (hasAutoLayout) {
      const frame = node as FrameNode;
      // Only round padding if it's explicitly set
      if (frame.paddingLeft !== undefined && frame.paddingLeft === frame.paddingRight && frame.paddingLeft === frame.paddingTop && frame.paddingLeft === frame.paddingBottom) {
        const newPadding = applyRoundingStrategy(frame.paddingLeft, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
        if (newPadding !== frame.paddingLeft) {
          frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = newPadding;
          stats.propertiesRounded++;
          stats.modifiedProperties.add("padding");
        }
      } else {
        // Handle individual padding values
        if (frame.paddingLeft !== undefined) {
          const newPaddingLeft = applyRoundingStrategy(frame.paddingLeft, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newPaddingLeft !== frame.paddingLeft) {
            frame.paddingLeft = newPaddingLeft;
            stats.propertiesRounded++;
            stats.modifiedProperties.add("paddingLeft");
          }
        }
        if (frame.paddingRight !== undefined) {
          const newPaddingRight = applyRoundingStrategy(frame.paddingRight, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newPaddingRight !== frame.paddingRight) {
            frame.paddingRight = newPaddingRight;
            stats.propertiesRounded++;
            stats.modifiedProperties.add("paddingRight");
          }
        }
        if (frame.paddingTop !== undefined) {
          const newPaddingTop = applyRoundingStrategy(frame.paddingTop, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newPaddingTop !== frame.paddingTop) {
            frame.paddingTop = newPaddingTop;
            stats.propertiesRounded++;
            stats.modifiedProperties.add("paddingTop");
          }
        }
        if (frame.paddingBottom !== undefined) {
          const newPaddingBottom = applyRoundingStrategy(frame.paddingBottom, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
          if (newPaddingBottom !== frame.paddingBottom) {
            frame.paddingBottom = newPaddingBottom;
            stats.propertiesRounded++;
            stats.modifiedProperties.add("paddingBottom");
          }
        }
      }

      // Item spacing
      if (frame.itemSpacing !== undefined) {
        const newItemSpacing = applyRoundingStrategy(frame.itemSpacing, options.roundingFactorByProperty.dimensions, options.roundingStrategy);
        if (newItemSpacing !== frame.itemSpacing) {
          frame.itemSpacing = newItemSpacing;
          stats.propertiesRounded++;
          stats.modifiedProperties.add("itemSpacing");
        }
      }
    }

    // Rotation
    if ("rotation" in node) {
      const rotation = node.rotation;
      if (typeof rotation === "number") {
        const newRotation = applyRoundingStrategy(rotation, roundingFactor, options.roundingStrategy);
        if (newRotation !== rotation) {
          node.rotation = newRotation;
          stats.propertiesRounded++;
          stats.modifiedProperties.add("rotation");
        }
      }
    }

    // Text properties with specific rounding factor
    if (node.type === "TEXT") {
      await figma.loadFontAsync(node.fontName as FontName);

      if (typeof node.fontSize === "number") {
        const newSize = applyRoundingStrategy(node.fontSize, options.roundingFactorByProperty.fontSize, options.roundingStrategy);
        if (newSize !== node.fontSize) {
          node.fontSize = newSize;
          stats.propertiesRounded++;
          stats.modifiedProperties.add("fontSize");
        }
      }

      // Add line height handling
      if (node.lineHeight && typeof node.lineHeight !== "symbol") {
        if (node.lineHeight.unit === "PIXELS" && typeof node.lineHeight.value === "number") {
          const newLineHeight = applyRoundingStrategy(node.lineHeight.value, options.roundingFactorByProperty.lineHeight || 1, options.roundingStrategy);
          if (newLineHeight !== node.lineHeight.value) {
            node.lineHeight = { unit: "PIXELS", value: newLineHeight };
            stats.propertiesRounded++;
            stats.modifiedProperties.add("lineHeight");
          }
        } else if (node.lineHeight.unit === "PERCENT" && typeof node.lineHeight.value === "number") {
          // For percentage line heights, round to nearest whole percent
          const newLineHeight = applyRoundingStrategy(node.lineHeight.value, options.roundingFactorByProperty.lineHeight || 1, options.roundingStrategy);
          if (newLineHeight !== node.lineHeight.value) {
            node.lineHeight = { unit: "PERCENT", value: newLineHeight };
            stats.propertiesRounded++;
            stats.modifiedProperties.add("lineHeight");
          }
        }
      }

      // Add letter spacing handling
      if (node.letterSpacing && typeof node.letterSpacing !== "symbol") {
        if (node.letterSpacing.unit === "PIXELS" && typeof node.letterSpacing.value === "number") {
          const newLetterSpacing = applyRoundingStrategy(node.letterSpacing.value, options.roundingFactorByProperty.fontSize || 1, options.roundingStrategy);
          if (newLetterSpacing !== node.letterSpacing.value) {
            node.letterSpacing = { unit: "PIXELS", value: newLetterSpacing };
            stats.propertiesRounded++;
            stats.modifiedProperties.add("letterSpacing");
          }
        } else if (node.letterSpacing.unit === "PERCENT" && typeof node.letterSpacing.value === "number") {
          const newLetterSpacing = applyRoundingStrategy(node.letterSpacing.value, options.roundingFactorByProperty.fontSize || 1, options.roundingStrategy);
          if (newLetterSpacing !== node.letterSpacing.value) {
            node.letterSpacing = { unit: "PERCENT", value: newLetterSpacing };
            stats.propertiesRounded++;
            stats.modifiedProperties.add("letterSpacing");
          }
        }
      }
    }

    // Vector properties
    if (options.roundVectors && "vectorNetwork" in node) {
      if (node.vectorNetwork) {
        try {
          const newNetwork = roundDeepValues(node.vectorNetwork, options.roundingFactorByProperty.vectors, options.roundingStrategy) as VectorNetwork;

          // Only proceed if we have valid vertices and segments
          if (newNetwork?.vertices?.length > 0 && newNetwork?.segments?.length > 0) {
            // Filter out any segments that reference invalid vertices
            const vertexCount = newNetwork.vertices.length;
            const validSegments = newNetwork.segments.filter((segment: VectorSegment) => {
              return segment && typeof segment.start === "number" && typeof segment.end === "number" && segment.start >= 0 && segment.end >= 0 && segment.start < vertexCount && segment.end < vertexCount;
            });

            // Create a new network with the valid segments
            const validNetwork: VectorNetwork = {
              vertices: newNetwork.vertices,
              segments: validSegments,
            };

            const currentNetwork = JSON.stringify(node.vectorNetwork);
            const newNetworkStr = JSON.stringify(validNetwork);

            if (currentNetwork !== newNetworkStr) {
              await node.setVectorNetworkAsync(validNetwork);
              stats.propertiesRounded++;
              stats.modifiedProperties.add("vectorNetwork");
            }
          }
        } catch (error) {
          console.error(`Error setting vector network for node "${node.name}":`, error);
          stats.errorCount++;
        }
      }
    }

    // Effects
    if (options.roundEffects && "effects" in node && Array.isArray(node.effects)) {
      const newEffects = node.effects.map((effect) => roundDeepValues(effect, options.roundingFactorByProperty.effects, options.roundingStrategy));
      if (JSON.stringify(newEffects) !== JSON.stringify(node.effects)) {
        node.effects = newEffects;
        stats.propertiesRounded++;
        stats.modifiedProperties.add("effects");
      }
    }

    // Add corner radius handling for rectangles, frames, and components
    if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
      const newRadius = applyRoundingStrategy(node.cornerRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.cornerRadius) {
        // Use setCornerRadius method if available
        if ("setCornerRadius" in node && typeof node.setCornerRadius === "function") {
          node.setCornerRadius(newRadius);
          stats.propertiesRounded++;
          stats.modifiedProperties.add("cornerRadius");
        } else if (node.type === "RECTANGLE" || node.type === "ELLIPSE" || node.type === "POLYGON" || node.type === "STAR") {
          // For these node types, we can set cornerRadius directly
          (node as any).cornerRadius = newRadius;
          stats.propertiesRounded++;
          stats.modifiedProperties.add("cornerRadius");
        }
      }
    }

    // Handle individual corner radii if they exist
    if ("topLeftRadius" in node && typeof node.topLeftRadius === "number") {
      const newRadius = applyRoundingStrategy(node.topLeftRadius, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy);
      if (newRadius !== node.topLeftRadius) {
        // Use setCornerRadii method if available
        if ("setCornerRadii" in node && typeof node.setCornerRadii === "function") {
          node.setCornerRadii([newRadius, node.topRightRadius || 0, node.bottomRightRadius || 0, node.bottomLeftRadius || 0]);
          stats.propertiesRounded++;
          stats.modifiedProperties.add("topLeftRadius");
        }
      }
    } else if (("topRightRadius" in node && typeof node.topRightRadius === "number") || ("bottomRightRadius" in node && typeof node.bottomRightRadius === "number") || ("bottomLeftRadius" in node && typeof node.bottomLeftRadius === "number")) {
      // If any of the individual corner radii exist, set them all at once
      if ("setCornerRadii" in node && typeof node.setCornerRadii === "function") {
        const topLeft = "topLeftRadius" in node ? applyRoundingStrategy(node.topLeftRadius as number, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy) : 0;
        const topRight = "topRightRadius" in node ? applyRoundingStrategy(node.topRightRadius as number, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy) : 0;
        const bottomRight = "bottomRightRadius" in node ? applyRoundingStrategy(node.bottomRightRadius as number, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy) : 0;
        const bottomLeft = "bottomLeftRadius" in node ? applyRoundingStrategy(node.bottomLeftRadius as number, options.roundingFactorByProperty.cornerRadius || roundingFactor, options.roundingStrategy) : 0;

        // Only set if any value changed
        if (topLeft !== (node.topLeftRadius || 0) || topRight !== (node.topRightRadius || 0) || bottomRight !== (node.bottomRightRadius || 0) || bottomLeft !== (node.bottomLeftRadius || 0)) {
          node.setCornerRadii([topLeft, topRight, bottomRight, bottomLeft]);
          stats.propertiesRounded++;
          stats.modifiedProperties.add("cornerRadii");
        }
      }
    }
  } catch (error) {
    console.error(`Error processing properties for node "${node.name}":`, error);
    stats.errorCount++;
  }
}

// Process all nodes on the page
async function roundPixels(roundingFactor: number = 1, options: RoundingOptions = DEFAULT_OPTIONS, stats: RoundingStats, excludedNodes: string[] = []): Promise<string> {
  const processedNodes = new Set<string>();
  const excludedSet = new Set(excludedNodes);

  // Get total count first - for document mode, use all nodes
  const allNodes = figma.currentPage.findAll();
  const totalNodes = allNodes.length;
  let processedCount = 0;

  // Send initial progress
  figma.ui.postMessage({
    type: "progress-update",
    progress: 0,
    phase: "analyzing",
  });

  const traverseChildren = async (node: SceneNode) => {
    try {
      // Skip if already processed or excluded
      if (processedNodes.has(node.id) || excludedSet.has(node.id)) return;
      processedNodes.add(node.id);

      // Process the current node
      await processNodeProperties(node, roundingFactor, options, stats);

      processedCount++;
      // Send progress update
      figma.ui.postMessage({
        type: "progress-update",
        progress: processedCount / totalNodes,
        phase: "processing",
      });

      // Handle children
      if ("children" in node) {
        // For instances, we can only modify the instance properties, not its contents
        if (node.type === "INSTANCE") {
          console.log(`Skipping contents of instance "${node.name}" - instance contents are locked by default`);
          return;
        }

        // For all other container types, process children
        for (const child of node.children) {
          await traverseChildren(child);
        }
      }
    } catch (error) {
      console.error(`Error processing node "${node.name}":`, error);
    }
  };

  try {
    for (const node of allNodes) {
      await traverseChildren(node);
    }

    // Send completion progress
    figma.ui.postMessage({
      type: "progress-update",
      progress: 1,
      phase: "complete",
    });

    return "Done!";
  } catch (error) {
    console.error("Error in roundPixels:", error);
    return "Error occurred while processing nodes";
  }
}

// Process only selected nodes and their descendants
async function selectAndRoundType(roundingFactor: number = 1, options: RoundingOptions = DEFAULT_OPTIONS, stats: RoundingStats, excludedNodes: string[] = []): Promise<string> {
  const processedNodes = new Set<string>();
  const excludedSet = new Set(excludedNodes);

  const selection = figma.currentPage.selection;

  // Calculate total nodes for selection mode by counting each selected node and its descendants
  let totalNodes = 0;
  for (const node of selection) {
    // Count the node itself
    totalNodes++;
    // Count all descendants if it's a container
    if ("children" in node) {
      totalNodes += node.findAll().length;
    }
  }

  let processedCount = 0;

  // Send initial progress
  figma.ui.postMessage({
    type: "progress-update",
    progress: 0,
    phase: "analyzing",
  });

  const traverseChildren = async (node: SceneNode) => {
    try {
      // Skip if already processed or excluded
      if (processedNodes.has(node.id) || excludedSet.has(node.id)) return;
      processedNodes.add(node.id);

      // Process the current node
      await processNodeProperties(node, roundingFactor, options, stats);

      processedCount++;
      // Send progress update
      figma.ui.postMessage({
        type: "progress-update",
        progress: processedCount / totalNodes,
        phase: "processing",
      });

      // Handle children
      if ("children" in node) {
        // For instances, we can only modify the instance properties, not its contents
        if (node.type === "INSTANCE") {
          console.log(`Skipping contents of instance "${node.name}" - instance contents are locked by default`);
          return;
        }

        // For all other container types, process children
        for (const child of node.children) {
          await traverseChildren(child);
        }
      }
    } catch (error) {
      console.error(`Error processing node "${node.name}":`, error);
    }
  };

  try {
    if (selection.length === 0) {
      figma.notify("Please select at least one element");
      return "No selection";
    }

    for (const node of selection) {
      await traverseChildren(node);
    }

    // Send completion progress
    figma.ui.postMessage({
      type: "progress-update",
      progress: 1,
      phase: "complete",
    });

    return "Done!";
  } catch (error) {
    console.error("Error in selectAndRoundType:", error);
    return "Error occurred while processing nodes";
  }
}
