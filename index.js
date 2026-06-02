import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { yaml } from '../../../../lib.js';

const EXTENSION_KEY = 'customModels';
const CUSTOM_OPTGROUP_ATTR = 'data-stcm-source';

const SOURCE_CONFIGS = [
    { source: 'openai', label: 'OpenAI', selector: '#model_openai_select', settingKey: 'openai_model' },
    { source: 'custom', label: 'Custom', selector: '#model_custom_select', settingKey: 'custom_model', inputSelector: '#custom_model_id', datalistSelector: '#model_custom_select_fill' },
    { source: 'ai21', label: 'AI21', selector: '#model_ai21_select', settingKey: 'ai21_model' },
    { source: 'aimlapi', label: 'AI/ML API', selector: '#model_aimlapi_select', settingKey: 'aimlapi_model' },
    { source: 'azure_openai', label: 'Azure OpenAI', selector: '#azure_openai_model', settingKey: 'azure_openai_model' },
    { source: 'chutes', label: 'Chutes', selector: '#model_chutes_select', settingKey: 'chutes_model' },
    { source: 'claude', label: 'Claude', selector: '#model_claude_select', settingKey: 'claude_model' },
    { source: 'cohere', label: 'Cohere', selector: '#model_cohere_select', settingKey: 'cohere_model' },
    { source: 'cometapi', label: 'CometAPI', selector: '#model_cometapi_select', settingKey: 'cometapi_model' },
    { source: 'deepseek', label: 'DeepSeek', selector: '#model_deepseek_select', settingKey: 'deepseek_model' },
    { source: 'electronhub', label: 'Electron Hub', selector: '#model_electronhub_select', settingKey: 'electronhub_model' },
    { source: 'fireworks', label: 'Fireworks AI', selector: '#model_fireworks_select', settingKey: 'fireworks_model' },
    { source: 'groq', label: 'Groq', selector: '#model_groq_select', settingKey: 'groq_model' },
    { source: 'makersuite', label: 'Google AI Studio', selector: '#model_google_select', settingKey: 'google_model', legacyProviderKeys: ['google'] },
    { source: 'vertexai', label: 'Google Vertex AI', selector: '#model_vertexai_select', settingKey: 'vertexai_model' },
    { source: 'minimax', label: 'MiniMax', selector: '#model_minimax_select', settingKey: 'minimax_model' },
    { source: 'mistralai', label: 'MistralAI', selector: '#model_mistralai_select', settingKey: 'mistralai_model' },
    { source: 'moonshot', label: 'Moonshot AI', selector: '#model_moonshot_select', settingKey: 'moonshot_model' },
    { source: 'nanogpt', label: 'NanoGPT', selector: '#model_nanogpt_select', settingKey: 'nanogpt_model' },
    { source: 'openrouter', label: 'OpenRouter', selector: '#model_openrouter_select', settingKey: 'openrouter_model' },
    { source: 'perplexity', label: 'Perplexity', selector: '#model_perplexity_select', settingKey: 'perplexity_model' },
    { source: 'pollinations', label: 'Pollinations', selector: '#model_pollinations_select', settingKey: 'pollinations_model' },
    { source: 'siliconflow', label: 'SiliconFlow', selector: '#model_siliconflow_select', settingKey: 'siliconflow_model' },
    { source: 'workers_ai', label: 'Cloudflare Workers AI', selector: '#model_workers_ai_select', settingKey: 'workers_ai_model' },
    { source: 'xai', label: 'xAI', selector: '#model_xai_select', settingKey: 'xai_model' },
    { source: 'zai', label: 'Z.AI', selector: '#model_zai_select', settingKey: 'zai_model' },
];

const renderingSources = new Set();

/** @type {(dom: HTMLElement, type: number, value?: string, options?: object) => Promise<unknown>} */
let popupCaller;
let popupType;
let popupResult;

try {
    const popup = await import('../../../popup.js');
    popupCaller = popup.callGenericPopup;
    popupType = popup.POPUP_TYPE;
    popupResult = popup.POPUP_RESULT;
} catch {
    popupCaller = (await import('../../../../script.js')).callPopup;
    popupType = { TEXT: 1 };
    popupResult = { AFFIRMATIVE: 1 };
}

const settings = normalizeSettings(extension_settings[EXTENSION_KEY]);
extension_settings[EXTENSION_KEY] = settings;

for (const config of SOURCE_CONFIGS) {
    initializeSource(config);
}

eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, applyModelBodyOverride);

function normalizeSettings(rawSettings) {
    const normalized = isPlainObject(rawSettings) ? rawSettings : {};

    if (!isPlainObject(normalized.provider)) {
        normalized.provider = {};
    }

    if (!isPlainObject(normalized.selected)) {
        normalized.selected = {};
    }

    if (!isPlainObject(normalized.model_overrides)) {
        normalized.model_overrides = {};
    }

    for (const config of SOURCE_CONFIGS) {
        const providerKeys = [config.source, ...(config.legacyProviderKeys ?? [])];
        const providerModels = providerKeys
            .map(key => normalized.provider[key])
            .find(value => Array.isArray(value));

        normalized.provider[config.source] = dedupeModelList(providerModels ?? []);

        if (!isPlainObject(normalized.model_overrides[config.source])) {
            normalized.model_overrides[config.source] = {};
        }

        normalized.model_overrides[config.source] = compactOverrides(normalized.model_overrides[config.source]);

        const legacySelected = typeof normalized[config.settingKey] === 'string' ? normalized[config.settingKey] : '';
        if (!normalized.selected[config.source] && legacySelected) {
            normalized.selected[config.source] = legacySelected;
        }

        if (typeof normalized.selected[config.source] !== 'string') {
            normalized.selected[config.source] = '';
        }

        normalized[config.settingKey] = normalized.selected[config.source];
    }

    return normalized;
}

function initializeSource(config) {
    const control = document.querySelector(config.selector);

    if (!(control instanceof HTMLSelectElement)) {
        return;
    }

    renderCustomModels(config, control);
    addEditorButton(config, control);
    restoreSelectedModel(config, control);
    attachSelectObserver(config, control);

    control.addEventListener('change', () => {
        saveSelectedModel(config, String(control.value || ''));
    });

    if (config.inputSelector) {
        const input = document.querySelector(config.inputSelector);
        if (input instanceof HTMLInputElement) {
            input.addEventListener('input', () => {
                saveSelectedModel(config, input.value);
            });
        }
    }
}

function attachSelectObserver(config, control) {
    const observer = new MutationObserver(() => {
        if (renderingSources.has(config.source)) {
            return;
        }

        renderCustomModels(config, control);
    });

    observer.observe(control, { childList: true });
}

function renderCustomModels(config, control = document.querySelector(config.selector)) {
    if (!(control instanceof HTMLSelectElement)) {
        return;
    }

    renderingSources.add(config.source);

    const group = ensureCustomOptGroup(config, control);
    group.innerHTML = '';

    for (const model of getCustomModels(config)) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        group.append(option);
    }

    renderCustomDatalist(config);

    queueMicrotask(() => renderingSources.delete(config.source));
}

function ensureCustomOptGroup(config, control) {
    const selector = `optgroup[${CUSTOM_OPTGROUP_ATTR}="${cssEscape(config.source)}"]`;
    let group = control.querySelector(selector);

    if (!(group instanceof HTMLOptGroupElement)) {
        group = document.createElement('optgroup');
        group.label = 'Custom Models';
        group.setAttribute(CUSTOM_OPTGROUP_ATTR, config.source);
        control.insertBefore(group, control.firstElementChild);
    }

    return group;
}

function renderCustomDatalist(config) {
    if (!config.datalistSelector) {
        return;
    }

    const datalist = document.querySelector(config.datalistSelector);
    if (!(datalist instanceof HTMLDataListElement)) {
        return;
    }

    datalist.querySelectorAll(`option[${CUSTOM_OPTGROUP_ATTR}="${cssEscape(config.source)}"]`).forEach(option => option.remove());

    for (const model of getCustomModels(config)) {
        const option = document.createElement('option');
        option.value = model;
        option.setAttribute(CUSTOM_OPTGROUP_ATTR, config.source);
        datalist.append(option);
    }
}

function addEditorButton(config, control) {
    if (document.querySelector(`[data-stcm-edit-source="${cssEscape(config.source)}"]`)) {
        return;
    }

    const button = document.createElement('div');
    button.classList.add('stcm--btn', 'menu_button', 'fa-solid', 'fa-fw', 'fa-pen-to-square');
    button.title = `Edit custom models for ${config.label}`;
    button.setAttribute('data-stcm-edit-source', config.source);
    button.addEventListener('click', () => openEditor(config, control));

    const header = findModelHeader(control);
    if (header) {
        header.append(button);
    } else {
        control.insertAdjacentElement('afterend', button);
    }
}

function findModelHeader(control) {
    let node = control;

    while (node && node !== document.body) {
        let previous = node.previousElementSibling;
        while (previous) {
            if (previous instanceof HTMLHeadingElement && previous.tagName === 'H4') {
                return previous;
            }

            const nestedHeaders = previous.querySelectorAll?.('h4') ?? [];
            if (nestedHeaders.length) {
                return nestedHeaders[nestedHeaders.length - 1];
            }

            previous = previous.previousElementSibling;
        }

        const container = node.closest?.('[data-source], form, .inline-drawer-content');
        if (container && container !== node) {
            const headers = Array.from(container.querySelectorAll('h4'));
            const controlPosition = getDocumentPosition(control);
            const beforeControl = headers.filter(header => getDocumentPosition(header) < controlPosition);
            if (beforeControl.length) {
                return beforeControl[beforeControl.length - 1];
            }
        }

        node = node.parentElement;
    }

    return null;
}

async function openEditor(config, control) {
    const draftModels = getCustomModels(config).slice();
    const draftOverrides = cloneOverrides(settings.model_overrides[config.source] ?? {});
    let activeOverrideModel = '';

    const dom = document.createElement('div');
    dom.classList.add('stcm--editor');

    const header = document.createElement('h3');
    header.textContent = `Custom Models: ${config.label}`;
    dom.append(header);

    const modelsLabel = createLabel('Custom model names');
    dom.append(modelsLabel);

    const modelsTextarea = document.createElement('textarea');
    modelsTextarea.classList.add('text_pole', 'stcm--models-textarea');
    modelsTextarea.rows = 12;
    modelsTextarea.value = draftModels.join('\n');
    modelsTextarea.placeholder = 'one model name per line';
    dom.append(modelsTextarea);

    const paramsBlock = document.createElement('div');
    paramsBlock.classList.add('stcm--params-block');
    dom.append(paramsBlock);

    const paramsTitle = document.createElement('h4');
    paramsTitle.textContent = 'Model Body Parameters';
    paramsBlock.append(paramsTitle);

    const targetLabel = createLabel('Model');
    paramsBlock.append(targetLabel);

    const targetInput = document.createElement('input');
    const listId = `stcm-model-targets-${config.source}`;
    targetInput.classList.add('text_pole', 'wide100p');
    targetInput.setAttribute('list', listId);
    paramsBlock.append(targetInput);

    const targetList = document.createElement('datalist');
    targetList.id = listId;
    paramsBlock.append(targetList);

    const textareas = document.createElement('div');
    textareas.classList.add('stcm--params-grid');
    paramsBlock.append(textareas);

    const includeWrap = document.createElement('label');
    includeWrap.classList.add('stcm--field');
    includeWrap.append(createLabelText('Include body YAML'));

    const includeBody = document.createElement('textarea');
    includeBody.classList.add('text_pole', 'stcm--params-textarea', 'monospace');
    includeBody.rows = 8;
    includeBody.placeholder = 'top_k: 20\nrepetition_penalty: 1.1';
    includeWrap.append(includeBody);
    textareas.append(includeWrap);

    const excludeWrap = document.createElement('label');
    excludeWrap.classList.add('stcm--field');
    excludeWrap.append(createLabelText('Exclude body YAML'));

    const excludeBody = document.createElement('textarea');
    excludeBody.classList.add('text_pole', 'stcm--params-textarea', 'monospace');
    excludeBody.rows = 8;
    excludeBody.placeholder = '- frequency_penalty\n- presence_penalty';
    excludeWrap.append(excludeBody);
    textareas.append(excludeWrap);

    const hint = document.createElement('small');
    hint.classList.add('stcm--hint');
    hint.textContent = 'Overrides are applied before SillyTavern sends the chat-completions payload. Custom source also receives these values through Additional Parameters.';
    paramsBlock.append(hint);

    const saveActiveOverride = () => {
        const model = activeOverrideModel.trim();
        if (!model) {
            return;
        }

        const include_body = includeBody.value;
        const exclude_body = excludeBody.value;

        if (include_body.trim() || exclude_body.trim()) {
            draftOverrides[model] = { include_body, exclude_body };
        } else {
            delete draftOverrides[model];
        }
    };

    const loadOverride = (model) => {
        activeOverrideModel = model.trim();
        targetInput.value = activeOverrideModel;
        const override = draftOverrides[activeOverrideModel] ?? {};
        includeBody.value = override.include_body ?? '';
        excludeBody.value = override.exclude_body ?? '';
        includeBody.disabled = !activeOverrideModel;
        excludeBody.disabled = !activeOverrideModel;
    };

    const refreshTargetList = () => {
        saveActiveOverride();
        targetList.innerHTML = '';

        const candidates = getOverrideCandidates(config, control, parseModelsText(modelsTextarea.value), draftOverrides);
        for (const model of candidates) {
            const option = document.createElement('option');
            option.value = model;
            targetList.append(option);
        }

        if (!activeOverrideModel) {
            loadOverride(String(control.value || candidates[0] || ''));
        } else if (!targetInput.value) {
            targetInput.value = activeOverrideModel;
        }
    };

    modelsTextarea.addEventListener('input', refreshTargetList);
    targetInput.addEventListener('change', () => {
        saveActiveOverride();
        loadOverride(targetInput.value);
    });

    refreshTargetList();

    const result = await popupCaller(dom, popupType.TEXT, null, { okButton: 'Save', wide: true, large: true });

    if (result === popupResult.AFFIRMATIVE) {
        saveActiveOverride();

        settings.provider[config.source] = parseModelsText(modelsTextarea.value);
        settings.model_overrides[config.source] = compactOverrides(draftOverrides);
        persistSettings();

        renderCustomModels(config, control);
        restoreSelectedModel(config, control);
    }
}

function getOverrideCandidates(config, control, draftModels, draftOverrides) {
    const options = Array.from(control.options)
        .filter(option => option.closest(`optgroup[${CUSTOM_OPTGROUP_ATTR}]`) === null)
        .map(option => option.value)
        .filter(Boolean);

    return dedupeModelList([
        String(control.value || ''),
        ...draftModels,
        ...Object.keys(draftOverrides),
        ...options,
        ...getCustomModels(config),
    ]);
}

function restoreSelectedModel(config, control) {
    const selectedModel = settings.selected[config.source] || settings[config.settingKey];
    if (!selectedModel) {
        return;
    }

    if (Array.from(control.options).some(option => option.value === selectedModel)) {
        control.value = selectedModel;
        control.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (config.inputSelector) {
        const input = document.querySelector(config.inputSelector);
        if (input instanceof HTMLInputElement) {
            input.value = selectedModel;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

function saveSelectedModel(config, model) {
    settings.selected[config.source] = model;
    settings[config.settingKey] = model;
    persistSettings();
}

function applyModelBodyOverride(generateData) {
    if (!isPlainObject(generateData)) {
        return;
    }

    const source = String(generateData.chat_completion_source || '');
    const model = String(generateData.model || '');
    const override = settings.model_overrides?.[source]?.[model];

    if (!override) {
        return;
    }

    const includeBody = String(override.include_body || '');
    const excludeBody = String(override.exclude_body || '');

    if (includeBody.trim()) {
        const includeObject = parseYamlObject(includeBody);
        Object.assign(generateData, includeObject);

        if (source === 'custom') {
            generateData.custom_include_body = stringifyYamlObject({
                ...parseYamlObject(generateData.custom_include_body),
                ...includeObject,
            });
        }
    }

    if (excludeBody.trim()) {
        const excludeKeys = parseYamlExcludeKeys(excludeBody);

        for (const key of excludeKeys) {
            delete generateData[key];
        }

        if (source === 'custom') {
            generateData.custom_exclude_body = stringifyYamlArray(dedupeModelList([
                ...parseYamlExcludeKeys(generateData.custom_exclude_body),
                ...excludeKeys,
            ]));
        }
    }
}

function getCustomModels(config) {
    if (!Array.isArray(settings.provider[config.source])) {
        settings.provider[config.source] = [];
    }

    return settings.provider[config.source];
}

function persistSettings() {
    extension_settings[EXTENSION_KEY] = settings;
    saveSettingsDebounced();
}

function parseModelsText(value) {
    return dedupeModelList(String(value || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean));
}

function compactOverrides(overrides) {
    if (!isPlainObject(overrides)) {
        return {};
    }

    const compacted = {};
    for (const [model, override] of Object.entries(overrides)) {
        if (!model || !isPlainObject(override)) {
            continue;
        }

        const include_body = typeof override.include_body === 'string' ? override.include_body : '';
        const exclude_body = typeof override.exclude_body === 'string' ? override.exclude_body : '';

        if (include_body.trim() || exclude_body.trim()) {
            compacted[model] = { include_body, exclude_body };
        }
    }

    return compacted;
}

function cloneOverrides(overrides) {
    return JSON.parse(JSON.stringify(compactOverrides(overrides)));
}

function parseYamlObject(value) {
    try {
        const parsed = yaml.parse(String(value || ''));

        if (Array.isArray(parsed)) {
            return Object.assign({}, ...parsed.filter(isPlainObject));
        }

        if (isPlainObject(parsed)) {
            return parsed;
        }
    } catch (error) {
        console.warn('[Custom Models] Could not parse include body YAML:', error);
    }

    return {};
}

function parseYamlExcludeKeys(value) {
    try {
        const parsed = yaml.parse(String(value || ''));

        if (Array.isArray(parsed)) {
            return parsed.map(String).filter(Boolean);
        }

        if (isPlainObject(parsed)) {
            return Object.keys(parsed);
        }

        if (typeof parsed === 'string') {
            return [parsed].filter(Boolean);
        }
    } catch (error) {
        console.warn('[Custom Models] Could not parse exclude body YAML:', error);
    }

    return [];
}

function stringifyYamlObject(value) {
    return Object.keys(value).length ? yaml.stringify(value).trim() : '';
}

function stringifyYamlArray(value) {
    return value.length ? yaml.stringify(value).trim() : '';
}

function dedupeModelList(models) {
    return Array.from(new Set(models.map(model => String(model || '').trim()).filter(Boolean)));
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createLabel(text) {
    const label = document.createElement('label');
    label.classList.add('stcm--label');
    label.textContent = text;
    return label;
}

function createLabelText(text) {
    const span = document.createElement('span');
    span.classList.add('stcm--label-text');
    span.textContent = text;
    return span;
}

function getDocumentPosition(element) {
    return Array.prototype.indexOf.call(document.querySelectorAll('*'), element);
}

function cssEscape(value) {
    return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
}
