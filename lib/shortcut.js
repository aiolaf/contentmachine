// Builds the iOS/macOS Shortcut that saves a shared link straight into the
// vault's Inbox through the GitHub contents API. The file is an unsigned
// shortcut (XML property list); macOS signs it with `shortcuts sign`.
const OBJ = '￼'; // placeholder for a variable inside a text field

const uuid = () => globalThis.crypto.randomUUID().toUpperCase();

// A text field: plain text with variables at the positions of OBJ.
function text(parts) {
  let string = '';
  const attachmentsByRange = {};
  for (const p of parts) {
    if (typeof p === 'string') {
      string += p;
    } else {
      attachmentsByRange[`{${string.length}, 1}`] = p;
      string += OBJ;
    }
  }
  return { Value: { string, attachmentsByRange }, WFSerializationType: 'WFTextTokenString' };
}

const output = (uuidValue, name) => ({ Type: 'ActionOutput', OutputUUID: uuidValue, OutputName: name });
const variable = (uuidValue, name) => ({ Value: output(uuidValue, name), WFSerializationType: 'WFTextTokenAttachment' });
const dictionary = (pairs) => ({
  Value: { WFDictionaryFieldValueItems: pairs.map(([key, value]) => ({ WFItemType: 0, WFKey: text([key]), WFValue: value })) },
  WFSerializationType: 'WFDictionaryFieldValue',
});
const action = (id, params) => ({ WFWorkflowActionIdentifier: id, WFWorkflowActionParameters: params });

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/￼/g, '&#xFFFC;');

function plist(v, pad = '') {
  const inner = `${pad}\t`;
  if (Array.isArray(v)) return v.length ? `<array>\n${v.map((x) => `${inner}${plist(x, inner)}`).join('\n')}\n${pad}</array>` : '<array/>';
  if (v === true) return '<true/>';
  if (v === false) return '<false/>';
  if (typeof v === 'number') return `<integer>${Math.round(v)}</integer>`;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '<dict/>';
    return `<dict>\n${keys.map((k) => `${inner}<key>${xmlEscape(k)}</key>\n${inner}${plist(v[k], inner)}`).join('\n')}\n${pad}</dict>`;
  }
  return `<string>${xmlEscape(v)}</string>`;
}

export function inboxApiUrl({ owner, repo, map }) {
  const path = [String(map || '').replace(/^\/+|\/+$/g, ''), 'Inbox'].filter(Boolean).map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}/`;
}

// token: put the token in the file. Without it, Shortcuts asks for it on import.
export function buildShortcut({ owner, repo, branch = 'main', map = 'Contentmachine', token = '' }) {
  const ids = { text: uuid(), b64: uuid(), date: uuid(), token: uuid(), put: uuid() };
  const actions = [
    action('is.workflow.actions.gettext', {
      UUID: ids.text,
      WFTextActionText: text([{ Type: 'ExtensionInput' }]),
    }),
    action('is.workflow.actions.base64encode', {
      UUID: ids.b64,
      WFEncodeMode: 'Encode',
      WFBase64LineBreakMode: 'None',
      WFInput: variable(ids.text, 'Text'),
    }),
    action('is.workflow.actions.format.date', {
      UUID: ids.date,
      WFDateFormatStyle: 'Custom',
      WFDateFormat: 'yyyyMMdd-HHmmss',
      WFDate: text([{ Type: 'CurrentDate' }]),
    }),
    action('is.workflow.actions.gettext', {
      UUID: ids.token,
      WFTextActionText: token ? text([token]) : text(['']),
    }),
    action('is.workflow.actions.downloadurl', {
      UUID: ids.put,
      WFURL: text([inboxApiUrl({ owner, repo, map }), output(ids.date, 'Formatted Date'), '.md']),
      WFHTTPMethod: 'PUT',
      ShowHeaders: true,
      WFHTTPHeaders: dictionary([
        ['Authorization', text(['Bearer ', output(ids.token, 'Text')])],
        ['Accept', text(['application/vnd.github+json'])],
      ]),
      WFHTTPBodyType: 'JSON',
      WFJSONValues: dictionary([
        ['message', text(['Gedeeld vanaf iPhone'])],
        ['content', text([output(ids.b64, 'Base64 Encoded')])],
        ['branch', text([branch])],
      ]),
    }),
    action('is.workflow.actions.notification', {
      WFNotificationActionTitle: 'Contentmachine',
      WFNotificationActionBody: 'Bewaard. Open de app om te ordenen.',
      WFNotificationActionSound: false,
    }),
  ];
  const shortcut = {
    WFWorkflowClientVersion: '2302.0.4',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4271458815, WFWorkflowIconGlyphNumber: 59446 },
    WFWorkflowTypes: ['ActionExtension'],
    WFWorkflowInputContentItemClasses: ['WFURLContentItem', 'WFStringContentItem', 'WFSafariWebPageContentItem', 'WFRichTextContentItem'],
    WFWorkflowHasShortcutInputVariables: true,
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowHasOutputFallback: false,
    WFQuickActionSurfaces: [],
    WFWorkflowImportQuestions: token ? [] : [{
      ActionIndex: 3,
      Category: 'Parameter',
      ParameterKey: 'WFTextActionText',
      DefaultValue: '',
      Text: 'Plak je GitHub-token (begint met github_pat_)',
    }],
    WFWorkflowActions: actions,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${plist(shortcut)}\n</plist>\n`;
}

export const SIGN_COMMAND = 'cd ~/Downloads && plutil -convert binary1 Contentmachine.shortcut && shortcuts sign --mode anyone --input Contentmachine.shortcut --output "Contentmachine klaar.shortcut" && open "Contentmachine klaar.shortcut"';
