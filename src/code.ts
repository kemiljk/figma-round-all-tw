figma.showUI(__html__, { themeColors: true, width: 300, height: 104 });

const layers = figma.currentPage.findAll();
let propertiesToRound = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing'];

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'select-and-run') {
    await roundPixels().then(() => figma.notify('All cleaned up!'));
    if (msg.checkboxOn === true) {
      figma.closePlugin();
    }
  }
  if (msg.type === 'run') {
    await selectAndRoundType().then(() => figma.notify('All cleaned up!'));
    if (msg.checkboxOn === true) {
      figma.closePlugin();
    }
  }
};

async function roundPixels(): Promise<string> {
  const traverseChildren = async (node: any) => {
    node.x = Math.round(node.x);
    node.y = Math.round(node.y);
    node.resize(Math.round(node.width), Math.round(node.height));
    node.rotation = Math.round(node.rotation);
    node.strokeWeight = Math.round(node.strokeWeight);

    switch (node.type) {
      case 'TEXT':
        await figma.loadFontAsync(node.fontName as FontName);
        const { textAutoResize } = node;
        node.textAutoResize = textAutoResize === 'NONE' ? 'NONE' : textAutoResize === 'HEIGHT' ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
        node.strokeWeight = Math.round(node.strokeWeight);
        node.fontSize = Math.round(node.fontSize);
        const LH = node.getRangeLineHeight(0, node.characters.length);

        if (LH.unit !== 'AUTO' && LH.unit !== 'PERCENT') {
          node.setRangeLineHeight(0, node.characters.length, {
            value: Math.round(LH.value),
            unit: 'PIXELS',
          });
        }

        if (LH.unit === 'PERCENT') {
          node.setRangeLineHeight(0, node.characters.length, {
            value: Math.round(LH.value),
            unit: 'PERCENT',
          });
        }

        const LS = node.getRangeLetterSpacing(0, node.characters.length);

        if (LS.unit === 'PIXELS') {
          node.setRangeLetterSpacing(0, node.characters.length, {
            value: Math.round(LS.value),
            unit: 'PIXELS',
          });
        }

        if (LS.unit === 'PERCENT') {
          node.setRangeLetterSpacing(0, node.characters.length, {
            value: Math.round(LS.value),
            unit: 'PERCENT',
          });
        }

        node.paragraphSpacing = Math.round(node.paragraphSpacing);
        break;

      case 'RECTANGLE':
      case 'ELLIPSE':
      case 'POLYGON':
      case 'STAR':
      case 'VECTOR':
      case 'LINE':
        node.strokeWeight = Math.round(node.strokeWeight);
        node.cornerRadius = Math.round(node.cornerRadius);
        node.rotation = Math.round(node.rotation);
        break;

      case 'FRAME':
      case 'GROUP':
      case 'COMPONENT':
      case 'INSTANCE':
        node.x = Math.round(node.x);
        node.y = Math.round(node.y);
        node.resize(Math.round(node.width), Math.round(node.height));
        node.rotation = Math.round(node.rotation);
        node.strokeWeight = Math.round(node.strokeWeight);
        node.cornerRadius = Math.round(node.cornerRadius);

        for (const property of propertiesToRound) {
          node[property] = Math.round(node[property]);
        }

        for (const child of node.children) {
          await traverseChildren(child);
        }

        break;

      default:
        break;
    }
  };

  figma.currentPage.findAll().forEach(async (node) => {
    await traverseChildren(node);
  });

  return 'Done!';
}

async function selectAndRoundType(): Promise<string> {
  const traverseChildren = async (node: any) => {
    node.x = Math.round(node.x);
    node.y = Math.round(node.y);
    node.resize(Math.round(node.width), Math.round(node.height));
    node.rotation = Math.round(node.rotation);
    node.strokeWeight = Math.round(node.strokeWeight);

    switch (node.type) {
      case 'TEXT':
        await figma.loadFontAsync(node.fontName as FontName);
        const { textAutoResize } = node;
        node.textAutoResize = textAutoResize === 'NONE' ? 'NONE' : textAutoResize === 'HEIGHT' ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
        node.strokeWeight = Math.round(node.strokeWeight);
        node.fontSize = Math.round(node.fontSize);
        const LH = node.getRangeLineHeight(0, node.characters.length);

        if (LH.unit !== 'AUTO' && LH.unit !== 'PERCENT') {
          node.setRangeLineHeight(0, node.characters.length, {
            value: Math.round(LH.value),
            unit: 'PIXELS',
          });
        }

        if (LH.unit === 'PERCENT') {
          node.setRangeLineHeight(0, node.characters.length, {
            value: Math.round(LH.value),
            unit: 'PERCENT',
          });
        }

        const LS = node.getRangeLetterSpacing(0, node.characters.length);

        if (LS.unit === 'PIXELS') {
          node.setRangeLetterSpacing(0, node.characters.length, {
            value: Math.round(LS.value),
            unit: 'PIXELS',
          });
        }

        if (LS.unit === 'PERCENT') {
          node.setRangeLetterSpacing(0, node.characters.length, {
            value: Math.round(LS.value),
            unit: 'PERCENT',
          });
        }

        node.paragraphSpacing = Math.round(node.paragraphSpacing);
        break;

      case 'RECTANGLE':
      case 'ELLIPSE':
      case 'POLYGON':
      case 'STAR':
      case 'VECTOR':
      case 'LINE':
        node.strokeWeight = Math.round(node.strokeWeight);
        node.cornerRadius = Math.round(node.cornerRadius);
        node.rotation = Math.round(node.rotation);
        break;

      case 'FRAME':
      case 'GROUP':
      case 'COMPONENT':
      case 'INSTANCE':
        node.x = Math.round(node.x);
        node.y = Math.round(node.y);
        node.resize(Math.round(node.width), Math.round(node.height));
        node.rotation = Math.round(node.rotation);
        node.strokeWeight = Math.round(node.strokeWeight);
        node.cornerRadius = Math.round(node.cornerRadius);

        for (const property of propertiesToRound) {
          node[property] = Math.round(node[property]);
        }

        for (const child of node.children) {
          await traverseChildren(child);
        }

        break;

      default:
        break;
    }
  };

  figma.currentPage.selection.forEach(async (node) => {
    await traverseChildren(node);
  });

  return 'Done!';
}
