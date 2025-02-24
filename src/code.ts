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
  ignoreTypes: [],
  roundingFactorByProperty: {
    dimensions: 8,
    fontSize: 2,
    effects: 1,
    vectors: 1,
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
  const scaled = value / factor;
  switch (strategy) {
    case "floor":
      return Math.floor(scaled) * factor;
    case "ceil":
      return Math.ceil(scaled) * factor;
    case "round":
    default:
      return Math.round(scaled) * factor;
  }
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
      const newRadius = applyRoundingStrategy(node.cornerRadius, roundingFactor, options.roundingStrategy);
      if (newRadius !== node.cornerRadius) {
        changes.propertyChanges[node.id].changes.push({
          property: "cornerRadius",
          from: node.cornerRadius,
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
    // Skip ignored node types
    if (options.ignoreTypes && options.ignoreTypes.indexOf(node.type) !== -1) {
      return;
    }

    // Track stats
    stats.nodesProcessed++;

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

      // ... similar updates for other text properties ...
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

    // ... continue with other property updates using the new options ...
  } catch (error) {
    console.error(`Error processing properties for node "${node.name}":`, error);
    stats.errorCount++;
  }
}

// Process all nodes on the page
async function roundPixels(roundingFactor: number = 1, options: RoundingOptions = DEFAULT_OPTIONS, stats: RoundingStats, excludedNodes: string[] = []): Promise<string> {
  const processedNodes = new Set<string>();
  const excludedSet = new Set(excludedNodes);

  const traverseChildren = async (node: SceneNode) => {
    try {
      // Skip if already processed or excluded
      if (processedNodes.has(node.id) || excludedSet.has(node.id)) return;
      processedNodes.add(node.id);

      // Process the current node
      await processNodeProperties(node, roundingFactor, options, stats);

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
    const allNodes = figma.currentPage.findAll();
    for (const node of allNodes) {
      await traverseChildren(node);
    }
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

  const traverseChildren = async (node: SceneNode) => {
    try {
      // Skip if already processed or excluded
      if (processedNodes.has(node.id) || excludedSet.has(node.id)) return;
      processedNodes.add(node.id);

      // Process the current node
      await processNodeProperties(node, roundingFactor, options, stats);

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
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Please select at least one element");
      return "No selection";
    }

    for (const node of selection) {
      await traverseChildren(node);
    }
    return "Done!";
  } catch (error) {
    console.error("Error in selectAndRoundType:", error);
    return "Error occurred while processing nodes";
  }
}
