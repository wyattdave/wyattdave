const body = document.body;
const navTree = document.getElementById('navTree');
const generatedSections = document.getElementById('generatedSections');
const blogSection = document.getElementById('blogs');
const spectrumSection = document.getElementById('spectrum');
const packageGeneratorSection = document.getElementById('package-generator');
const packageGeneratorForm = document.getElementById('packageGeneratorForm');
const metaRows = document.getElementById('metaRows');
const addMetaRowButton = document.getElementById('addMetaRow');
const packagePreview = document.getElementById('packagePreview');
const copyPackageJsonButton = document.getElementById('copyPackageJson');
const packageGeneratorStatus = document.getElementById('packageGeneratorStatus');
const launchButtons = Array.from(document.querySelectorAll('[data-open-section]'));
const settingsLauncher = document.getElementById('settingsLauncher');
const coffeeButton = document.getElementById('coffeeButton');
const helpButton = document.getElementById('helpButton');
const newFlowButton = document.getElementById('newFlowButton');
const importButton = document.getElementById('importButton');
const shareButton = document.getElementById('shareButton');
const activeTabLabel = document.getElementById('activeTabLabelText') || document.getElementById('activeTabLabel').querySelector('span:last-child');
const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');
const openEditorActiveLabel = document.getElementById('openEditorActiveLabel');
const setActiveLabels = (text) => {
    if (activeTabLabel) activeTabLabel.textContent = text;
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = text;
    if (openEditorActiveLabel) openEditorActiveLabel.textContent = text;
};
let navLinks = [];
let sections = [];
let configuredSections = [];
let activeSectionId = '';
const CRT_SHUTDOWN_MS = 520;
const CRT_STARTUP_MS = 640;
const PACKAGE_UNLOCK_TOKEN = 'ppac';
const PACKAGE_GENERATOR_ENTRY = {
    id: 'package-generator',
    icon: '⟡',
    title: 'package.json',
    dataFile: 'package.json'
};
const DEFAULT_META_ROW = {
    kind: 'tag',
    label: 'New tag',
    href: ''
};
const MARKDOWN_BLANK_LINE_SENTINEL = '&nbsp;';
let crtShutdownTimer = 0;
let crtStartupTimer = 0;
let packageGeneratorUnlocked = false;
const SHARE_MESSAGE =
`Check out these cool websites by David Wyatt:
• Portfolio – https://wyattdave.github.io/wyattdave/
• Power Devbox – https://powerdevbox.com/
• CodeaApp JS – https://codeappjs.com
• Power Platform Games – https://powerplatformgames.com`;
const FALLBACK_SITE_URL = 'https://wyattdave.github.io/wyattdave/';

const resolveRequestedProfileSectionId = (fallbackSectionId) => {
    const params = new URLSearchParams(window.location.search);
    const requestedSectionId = (params.get('profile') || '').trim().toLowerCase();

    if (!requestedSectionId) {
        return fallbackSectionId;
    }

    return document.getElementById(requestedSectionId)
        ? requestedSectionId
        : fallbackSectionId;
};

const hasRequestedProfileSection = () => new URLSearchParams(window.location.search).has('profile');

const getDefaultWorkspaceSectionId = () => configuredSections.find((section) => section.id === ABOUT_SECTION_ID)?.id
    || configuredSections[0]?.id
    || 'blogs';

const getQuickLinkBaseUrl = () => {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        return `${window.location.origin}${window.location.pathname}`;
    }

    return FALLBACK_SITE_URL;
};

const buildQuickLinkUrl = (sectionId) => `${getQuickLinkBaseUrl()}?profile=${encodeURIComponent(sectionId)}`;

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderInlineMarkdown = (value = '') => {
    let rendered = escapeHtml(value);
    rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return rendered;
};

const normalizeMarkdownLineEndings = (value = '') => String(value).replace(/\r\n?/g, '\n');

const isMarkdownBlankLineSentinel = (value = '') => value.trim() === MARKDOWN_BLANK_LINE_SENTINEL;

const serializeMarkdownForConfig = (value = '') => normalizeMarkdownLineEndings(value)
    .split('\n')
    .map((line) => line.trim() === '' ? MARKDOWN_BLANK_LINE_SENTINEL : line)
    .join('\n');

const deserializeMarkdownForEditor = (value = '') => normalizeMarkdownLineEndings(value)
    .split('\n')
    .map((line) => isMarkdownBlankLineSentinel(line) ? '' : line)
    .join('\n');

const parseImageLine = (line) => {
    const match = line.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+\"([^\"]+)\")?\)$/);
    if (!match) {
        return null;
    }

    return {
        alt: match[1],
        src: match[2],
        caption: match[3] || match[1] || 'Preview'
    };
};

const renderMarkdownBlock = (block) => {
    const lines = normalizeMarkdownLineEndings(block).split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
        return '';
    }

    const elements = [];
    let paragraphLines = [];
    let listItems = [];

    const flushParagraph = () => {
        if (!paragraphLines.length) {
            return;
        }

        elements.push(`<p>${renderInlineMarkdown(paragraphLines.join(' '))}</p>`);
        paragraphLines = [];
    };

    const flushList = () => {
        if (!listItems.length) {
            return;
        }

        elements.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
        listItems = [];
    };

    lines.forEach((line) => {
        const image = parseImageLine(line);
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        const listMatch = line.match(/^[-*]\s*(.+)$/);

        if (isMarkdownBlankLineSentinel(line)) {
            flushParagraph();
            flushList();
            elements.push('<p class="blank-line">&nbsp;</p>');
            return;
        }

        if (image) {
            flushParagraph();
            flushList();
            elements.push(`
                <figure class="screenshot-frame">
                    <div class="screenshot-stack">
                        <div class="screenshot-diff">diff --git a/preview b/preview</div>
                        <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}">
                        <figcaption class="screenshot-caption"><span>Screenshot</span><span>${escapeHtml(image.caption)}</span></figcaption>
                    </div>
                </figure>
            `);
            return;
        }

        if (headingMatch) {
            flushParagraph();
            flushList();
            const level = Math.min(6, headingMatch[1].length);
            elements.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
            return;
        }

        if (listMatch) {
            flushParagraph();
            listItems.push(listMatch[1]);
            return;
        }

        flushList();
        paragraphLines.push(line);
    });

    flushParagraph();
    flushList();

    return elements.join('');
};

const renderMarkdownContent = (markdown = '') => {
    const blocks = normalizeMarkdownLineEndings(markdown).trim().split(/\n\s*\n/).filter(Boolean);
    return `<div class="section-copy">${blocks.map(renderMarkdownBlock).join('')}</div>`;
};

const formatFileName = (order, file) => `${String(order).padStart(2, '0')}_${file}`;

const renderMetaItem = (item) => {
    if (item.kind === 'link') {
        return `<a class="resource-link inline" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a>`;
    }

    const className = item.kind === 'pill' ? 'mini-pill' : 'file-tag';
    return `<span class="${className}">${escapeHtml(item.label)}</span>`;
};

const renderNavLink = (section, active = false) => `
    <a class="nav-link pa-rail-item${active ? ' active' : ''}" href="#${escapeHtml(section.id)}" data-panel="${escapeHtml(section.id)}" title="${escapeHtml(section.title || section.dataFile)}">
        <span class="pa-rail-icon icon" aria-hidden="true">${escapeHtml(section.icon)}</span>
        <span class="pa-rail-label">${escapeHtml(section.title || section.dataFile)}</span>
    </a>
`;

const setPackageGeneratorStatus = (message) => {
    packageGeneratorStatus.textContent = message;
};

const getStaticEntries = () => {
    const entries = [
        { id: 'blogs', icon: '⨝', title: 'Blogs', dataFile: blogSection.dataset.file },
        { id: 'spectrum', icon: '▣', title: 'Spectrum Invaders', dataFile: spectrumSection.dataset.file }
    ];

    if (packageGeneratorUnlocked) {
        entries.push(PACKAGE_GENERATOR_ENTRY);
    }

    return entries;
};

const bindNavLinkHandlers = () => {
    navLinks = Array.from(document.querySelectorAll('.nav-link'));
    navLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            setActiveSection(link.dataset.panel);
        });
    });
};

const ABOUT_SECTION_ID = 'about';

const renderNavigation = (activeSectionId) => {
    navTree.innerHTML = [
        ...configuredSections
            .filter((section) => section.id !== ABOUT_SECTION_ID)
            .map((section) => renderNavLink(section, section.id === activeSectionId)),
        ...getStaticEntries().map((section) => renderNavLink(section, section.id === activeSectionId))
    ].join('');

    bindNavLinkHandlers();
};

const renderConfigSection = (section, active = false) => `
    <section class="code-file${active ? ' active' : ''}" id="${escapeHtml(section.id)}" data-file="${escapeHtml(section.dataFile)}">
        <div class="file-header">
            <h2>${escapeHtml(section.title)}</h2>
            <div class="file-meta">${(section.meta || []).map(renderMetaItem).join('')}</div>
        </div>
        <div class="code-body">
            <div class="section-content">${renderMarkdownContent(section.markdown)}</div>
        </div>
    </section>
`;

const createMetaRowMarkup = (meta = DEFAULT_META_ROW) => `
    <div class="meta-row">
        <label class="generator-subfield">
            <span>kind</span>
            <select data-meta-field="kind">
                <option value="tag"${meta.kind === 'tag' ? ' selected' : ''}>tag</option>
                <option value="pill"${meta.kind === 'pill' ? ' selected' : ''}>pill</option>
                <option value="link"${meta.kind === 'link' ? ' selected' : ''}>link</option>
            </select>
        </label>
        <label class="generator-subfield">
            <span>label</span>
            <input type="text" data-meta-field="label" value="${escapeHtml(meta.label || '')}" placeholder="Label">
        </label>
        <label class="generator-subfield">
            <span>href</span>
            <input type="text" data-meta-field="href" value="${escapeHtml(meta.href || '')}" placeholder="https://example.com">
        </label>
        <button class="action-button meta-remove" type="button" data-remove-meta>Remove</button>
    </div>
`;

const renderMetaRows = (metaItems = [DEFAULT_META_ROW]) => {
    metaRows.innerHTML = metaItems.map((meta) => createMetaRowMarkup(meta)).join('');
};

const normalizeMetaItems = (metaItems) => {
    if (!Array.isArray(metaItems) || !metaItems.length) {
        return [{ ...DEFAULT_META_ROW, label: '', href: '' }];
    }

    return metaItems.map((item) => {
        const kind = ['tag', 'pill', 'link'].includes(item?.kind) ? item.kind : DEFAULT_META_ROW.kind;
        const label = String(item?.label || '');
        const href = String(item?.href || '');

        return href ? { kind, label, href } : { kind, label };
    });
};

const applyGeneratedSectionPayloadToInputs = (payload) => {
    const normalizedPayload = {
        id: String(payload?.id || ''),
        icon: String(payload?.icon || ''),
        file: String(payload?.file || ''),
        title: String(payload?.title || ''),
        meta: normalizeMetaItems(payload?.meta),
        markdown: deserializeMarkdownForEditor(payload?.markdown || '')
    };

    packageGeneratorForm.elements.namedItem('id').value = normalizedPayload.id;
    packageGeneratorForm.elements.namedItem('icon').value = normalizedPayload.icon;
    packageGeneratorForm.elements.namedItem('file').value = normalizedPayload.file;
    packageGeneratorForm.elements.namedItem('title').value = normalizedPayload.title;
    packageGeneratorForm.elements.namedItem('markdown').value = normalizedPayload.markdown;
    renderMetaRows(normalizedPayload.meta);
};

const readMetaItems = () => Array.from(metaRows.querySelectorAll('.meta-row'))
    .map((row) => {
        const kind = row.querySelector('[data-meta-field="kind"]').value.trim();
        const label = row.querySelector('[data-meta-field="label"]').value.trim();
        const href = row.querySelector('[data-meta-field="href"]').value.trim();
        const hasValue = kind || label || href;

        if (!hasValue) {
            return null;
        }

        return href ? { kind, label, href } : { kind, label };
    })
    .filter(Boolean);

const getGeneratedSectionPayload = () => {
    const formData = new FormData(packageGeneratorForm);

    return {
        id: String(formData.get('id') || '').trim(),
        icon: String(formData.get('icon') || '').trim(),
        file: String(formData.get('file') || '').trim(),
        title: String(formData.get('title') || '').trim(),
        meta: readMetaItems(),
        markdown: serializeMarkdownForConfig(formData.get('markdown') || '')
    };
};

const syncPackagePreviewFromInputs = (message = 'Preview reset from form inputs.') => {
    packagePreview.value = JSON.stringify(getGeneratedSectionPayload(), null, 4);
    setPackageGeneratorStatus(message);
};

const syncInputsFromPackagePreview = ({ normalizePreview = false } = {}) => {
    try {
        const parsedPayload = JSON.parse(packagePreview.value);

        if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
            throw new Error('Section JSON must be an object.');
        }

        applyGeneratedSectionPayloadToInputs(parsedPayload);
        if (normalizePreview) {
            syncPackagePreviewFromInputs('Inputs updated from preview JSON.');
            return;
        }

        setPackageGeneratorStatus('Inputs updated from preview JSON.');
    } catch (error) {
        setPackageGeneratorStatus(`Preview JSON is not valid yet: ${error.message}`);
    }
};

const queuePreviewToInputSync = (options = {}) => {
    window.requestAnimationFrame(() => {
        syncInputsFromPackagePreview(options);
    });
};

const copyPreviewToClipboard = async () => {
    const previewValue = packagePreview.value;

    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(previewValue);
        return true;
    }

    packagePreview.focus();
    packagePreview.select();
    const copied = document.execCommand('copy');
    packagePreview.setSelectionRange(packagePreview.value.length, packagePreview.value.length);
    return copied;
};

const copyTextToClipboard = async (value) => {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
    }

    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);
    return copied;
};

const handleBreadcrumbQuickLinkCopy = async () => {
    if (!breadcrumbCurrent || !activeSectionId) {
        return;
    }

    const quickLinkUrl = buildQuickLinkUrl(activeSectionId);
    const originalTitle = breadcrumbCurrent.title;

    try {
        const copied = await copyTextToClipboard(quickLinkUrl);
        breadcrumbCurrent.title = copied ? 'Quick link copied' : 'Clipboard copy was blocked';
    } catch (error) {
        breadcrumbCurrent.title = `Clipboard copy failed: ${error.message}`;
    }

    window.setTimeout(() => {
        breadcrumbCurrent.title = originalTitle;
    }, 1400);
};

const isEditableTarget = (target) => {
    if (!target || !(target instanceof HTMLElement)) {
        return false;
    }

    return target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

const ensurePackageGeneratorVisible = () => {
    if (packageGeneratorUnlocked) {
        return;
    }

    packageGeneratorUnlocked = true;
    packageGeneratorSection.classList.remove('concealed-panel');
    packageGeneratorSection.setAttribute('aria-hidden', 'false');
    sections = Array.from(document.querySelectorAll('.code-file'));
    renderNavigation(PACKAGE_GENERATOR_ENTRY.id);
};

const revealPackageGenerator = () => {
    ensurePackageGeneratorVisible();

    setPackageGeneratorStatus('Generator unlocked. Form edits now control the preview again.');
    transitionToWorkspace(PACKAGE_GENERATOR_ENTRY.id);
};

const buildConfiguredSections = () => {
    configuredSections = (sectionConfig.sections || []).map((section, index) => ({
        ...section,
        dataFile: formatFileName(index + 1, section.file)
    }));

    generatedSections.innerHTML = configuredSections.map((section, index) => renderConfigSection(section, index === 0)).join('');

    blogSection.dataset.file = formatFileName(configuredSections.length + 1, 'blogs.api.js');
    spectrumSection.dataset.file = formatFileName(configuredSections.length + 2, 'spectrum_invaders.js');

    const defaultSectionId = getDefaultWorkspaceSectionId();
    const initialSectionId = resolveRequestedProfileSectionId(defaultSectionId);

    renderNavigation(initialSectionId);
    sections = Array.from(document.querySelectorAll('.code-file'));
    setActiveSection(initialSectionId);

    launchButtons.forEach((button) => {
        button.dataset.openSection = initialSectionId;
    });

    return initialSectionId;
};

const setActiveSection = (sectionId) => {
    if (sectionId === PACKAGE_GENERATOR_ENTRY.id) {
        ensurePackageGeneratorVisible();
    }

    activeSectionId = sectionId;

    const activeSection = document.getElementById(sectionId);
    if (activeSection?.dataset.file) {
        setActiveLabels(activeSection.dataset.file);
    }

    sections.forEach((section) => {
        section.classList.toggle('active', section.id === sectionId);
    });

    navLinks.forEach((link) => {
        const active = link.dataset.panel === sectionId;
        link.classList.toggle('active', active);
    });
};

const resetWorkspaceTransitionState = () => {
    window.clearTimeout(crtShutdownTimer);
    window.clearTimeout(crtStartupTimer);
    body.classList.remove('is-crt-transitioning', 'crt-phase-shutdown', 'crt-phase-startup');
    launchButtons.forEach((button) => {
        button.disabled = false;
        button.removeAttribute('aria-disabled');
    });
};

const showWorkspaceImmediately = (sectionId) => {
    setActiveSection(sectionId);
    resetWorkspaceTransitionState();
    body.classList.remove('view-landing');
    body.classList.add('view-workspace');
};

const transitionToWorkspace = (sectionId) => {
    setActiveSection(sectionId);

    if (!body.classList.contains('view-landing')) {
        body.classList.add('view-workspace');
        body.classList.remove('view-landing');
        return;
    }

    if (body.classList.contains('is-crt-transitioning')) {
        return;
    }

    body.classList.add('is-crt-transitioning', 'crt-phase-shutdown');
    launchButtons.forEach((button) => {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
    });

    crtShutdownTimer = window.setTimeout(() => {
        body.classList.remove('view-landing', 'crt-phase-shutdown');
        body.classList.add('view-workspace', 'crt-phase-startup');

        crtStartupTimer = window.setTimeout(() => {
            resetWorkspaceTransitionState();
        }, CRT_STARTUP_MS);
    }, CRT_SHUTDOWN_MS);
};

const defaultSectionId = buildConfiguredSections();
if (hasRequestedProfileSection()) {
    showWorkspaceImmediately(defaultSectionId);
}

if (breadcrumbCurrent) {
    breadcrumbCurrent.title = 'Copy Quick link to clipboard';
    breadcrumbCurrent.setAttribute('role', 'button');
    breadcrumbCurrent.setAttribute('tabindex', '0');
    breadcrumbCurrent.setAttribute('aria-label', 'Copy Quick link to clipboard');
    breadcrumbCurrent.addEventListener('click', () => {
        handleBreadcrumbQuickLinkCopy();
    });
    breadcrumbCurrent.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleBreadcrumbQuickLinkCopy();
        }
    });
}

renderMetaRows();
syncPackagePreviewFromInputs('Generator ready. Any field change will rebuild the JSON block.');

packageGeneratorForm.addEventListener('input', () => {
    syncPackagePreviewFromInputs();
});

packagePreview.addEventListener('input', () => {
    syncInputsFromPackagePreview();
});

packagePreview.addEventListener('change', () => {
    syncInputsFromPackagePreview({ normalizePreview: true });
});

packagePreview.addEventListener('blur', () => {
    syncInputsFromPackagePreview({ normalizePreview: true });
});

packagePreview.addEventListener('paste', () => {
    queuePreviewToInputSync({ normalizePreview: true });
});

addMetaRowButton.addEventListener('click', () => {
    metaRows.insertAdjacentHTML('beforeend', createMetaRowMarkup({ kind: 'tag', label: '', href: '' }));
    syncPackagePreviewFromInputs('Meta row added and preview reset from form inputs.');
});

metaRows.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-meta]');
    if (!removeButton) {
        return;
    }

    const rows = Array.from(metaRows.querySelectorAll('.meta-row'));
    if (rows.length === 1) {
        rows[0].querySelector('[data-meta-field="kind"]').value = DEFAULT_META_ROW.kind;
        rows[0].querySelector('[data-meta-field="label"]').value = '';
        rows[0].querySelector('[data-meta-field="href"]').value = '';
    } else {
        removeButton.closest('.meta-row').remove();
    }

    syncPackagePreviewFromInputs('Meta rows updated and preview reset from form inputs.');
});

copyPackageJsonButton.addEventListener('click', async () => {
    try {
        const copied = await copyPreviewToClipboard();
        setPackageGeneratorStatus(copied ? 'Section JSON copied to clipboard.' : 'Clipboard copy was blocked by the browser.');
    } catch (error) {
        setPackageGeneratorStatus(`Clipboard copy failed: ${error.message}`);
    }
});

launchButtons.forEach((button) => {
    button.addEventListener('click', () => {
        transitionToWorkspace(button.dataset.openSection || defaultSectionId);
    });
});

if (newFlowButton) {
    newFlowButton.addEventListener('click', () => {
        window.open('https://make.powerautomate.com', '_blank', 'noopener,noreferrer');
    });
}

if (importButton) {
    importButton.addEventListener('click', () => {
        window.open('https://powerdevbox.com/contact', '_blank', 'noopener,noreferrer');
    });
}

if (coffeeButton) {
    coffeeButton.addEventListener('click', () => {
        window.open('https://buymeacoffee.com/wyattdave', '_blank', 'noopener,noreferrer');
    });
}

if (helpButton) {
    helpButton.addEventListener('click', () => {
        window.open('https://community.powerplatform.com/forums/thread/?partialUrl=MPACommunity', '_blank', 'noopener,noreferrer');
    });
}

if (shareButton) {
    shareButton.addEventListener('click', () => {
        window.location.href = `mailto:?subject=Cool Power Platform Sites&body=${encodeURIComponent(SHARE_MESSAGE)}`;
    });
}

/* Account avatar opens the About Me section (it is no longer in the sidebar). */
const accountAvatar = document.querySelector('.pa-avatar');
if (accountAvatar) {
    accountAvatar.addEventListener('click', () => {
        transitionToWorkspace(ABOUT_SECTION_ID);
    });
}

/* Auto-reboot the BSOD landing into the workspace after 5 seconds. */
if (body.classList.contains('view-landing') && !hasRequestedProfileSection()) {
    window.setTimeout(() => {
        if (body.classList.contains('view-landing') && !body.classList.contains('is-crt-transitioning')) {
            transitionToWorkspace(defaultSectionId);
        }
    }, 5000);
}

const fallbackArticles = [
    {
        title: 'Power Apps- Comparing Different Ways to Create Apps With AI',
        description: 'A comparison of several ways to vibe-code apps in the Power Platform.',
        url: 'https://dev.to/wyattdave/power-apps-comparing-different-ways-to-create-apps-with-ai-b33',
        readable_publish_date: 'Apr 20',
        reading_time_minutes: 9,
        tag_list: ['powerapps', 'powerplatform', 'vibecoding', 'ai'],
        cover_image: 'https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fz1wrmtw2d2rxeqanw5v1.png'
    },
    {
        title: 'How to Create Your Own AI Coding Agent',
        description: 'A practical walkthrough of what happens when you build the coding agent instead of only using one.',
        url: 'https://dev.to/wyattdave/how-to-create-your-own-ai-coding-agent-2h1o',
        readable_publish_date: 'Apr 6',
        reading_time_minutes: 8,
        tag_list: ['powerapps', 'vscode', 'coding', 'powerplatform'],
        cover_image: 'https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F8iochsukrm6r2gfv5ff1.png'
    },
    {
        title: 'Setting Your Environments Up for Code Apps',
        description: 'Why Code Apps need the right environment setup before the developer experience really clicks.',
        url: 'https://dev.to/wyattdave/setting-your-environments-up-for-code-apps-16i8',
        readable_publish_date: 'Mar 23',
        reading_time_minutes: 6,
        tag_list: ['powerapps', 'powerplatform', 'react', 'lowcode'],
        cover_image: 'https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fyrt099wigk1ub8hhtt9b.png'
    },
    {
        title: 'Power Apps - A Cooler Way to use Code Apps',
        description: 'A code-first take on using Code Apps inside the Power Platform.',
        url: 'https://dev.to/wyattdave/power-apps-a-cooler-way-to-use-code-apps-3nb6',
        readable_publish_date: 'Mar 16',
        reading_time_minutes: 5,
        tag_list: ['powerapps', 'powerplatform', 'ai', 'cli'],
        cover_image: 'https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F1olp1950xa1bh4fbb1il.png'
    }
];

const blogElements = {
    list: document.getElementById('blogList'),
    status: document.getElementById('blogStatus'),
    prev: document.getElementById('blogPrev'),
    next: document.getElementById('blogNext')
};

const BLOG_FETCH_PAGE_SIZE = 30;

const blogState = {
    page: 1,
    perPage: 10,
    loading: false,
    usedFallback: false,
    allArticles: []
};

const trimBlogContextArticle = (article) => ({
    id: article.id,
    title: article.title,
    description: article.description,
    url: article.url,
    tag_list: article.tag_list,
    published_at: article.published_at,
    readable_publish_date: article.readable_publish_date,
    reading_time_minutes: article.reading_time_minutes,
    positive_reactions_count: article.positive_reactions_count
});

const syncSharedBlogContext = () => {
    window.wyattDaveBlogContext = blogState.allArticles.map(trimBlogContextArticle);
    return window.wyattDaveBlogContext;
};

const normalizeImage = (article) => article.cover_image || article.social_image || 'img/how%20to.png';

const renderBlogCards = (articles) => {
    blogElements.list.innerHTML = '';

    articles.forEach((article) => {
        const card = document.createElement('article');
        card.className = 'blog-card';
        card.innerHTML = `
            <img src="${normalizeImage(article)}" alt="${article.title} preview">
            <div class="blog-card-copy">
                <div class="blog-card-header">
                    <span>${article.readable_publish_date || 'Recent'}</span>
                    <span>${article.reading_time_minutes || '?'} min</span>
                </div>
                <strong>${article.title}</strong>
                <p>${article.description || 'Open the post for the full write-up.'}</p>
            </div>
            <a class="blog-card-link" href="${article.url}" target="_blank" rel="noreferrer">Read on Dev.to</a>
        `;
        blogElements.list.appendChild(card);
    });
};

const setBlogLoadingState = (loading) => {
    blogState.loading = loading;
    if (loading) {
        blogElements.prev.disabled = true;
        blogElements.next.disabled = true;
        return;
    }

    blogElements.prev.disabled = blogState.page === 1;
    blogElements.next.disabled = false;
};

const syncBlogPager = () => {
    const totalPages = Math.max(1, Math.ceil(blogState.allArticles.length / blogState.perPage));
    blogElements.prev.disabled = blogState.loading || blogState.page === 1;
    blogElements.next.disabled = blogState.loading || blogState.page >= totalPages;
};

const updateBlogStatus = (message) => {
    blogElements.status.textContent = message;
};

const renderBlogPage = (page) => {
    if (!blogState.allArticles.length) {
        blogState.page = 1;
        renderBlogCards([]);
        updateBlogStatus('No blog posts are available right now.');
        setBlogLoadingState(false);
        syncBlogPager();
        return;
    }

    const totalPages = Math.max(1, Math.ceil(blogState.allArticles.length / blogState.perPage));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * blogState.perPage;
    const end = start + blogState.perPage;
    const pageArticles = blogState.allArticles.slice(start, end);

    blogState.page = safePage;
    renderBlogCards(pageArticles);

    const pageSuffix = blogState.usedFallback ? ' using a fallback snapshot' : ' from the live API';
    updateBlogStatus(`Page ${safePage} of ${totalPages}${pageSuffix}`);
    setBlogLoadingState(false);
    syncBlogPager();
};

const loadAllBlogs = async () => {
    if (blogState.loading) {
        return blogState.allArticles;
    }

    setBlogLoadingState(true);
    updateBlogStatus('Loading all Dev.to articles...');

    let articles = [];
    let usedFallback = false;

    try {
        let page = 1;

        while (true) {
            const response = await fetch(`https://dev.to/api/articles?username=wyattdave&per_page=${BLOG_FETCH_PAGE_SIZE}&page=${page}`);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const batch = await response.json();
            if (!Array.isArray(batch)) {
                throw new Error('Unexpected article payload');
            }

            if (!batch.length) {
                break;
            }

            articles.push(...batch);

            if (batch.length < BLOG_FETCH_PAGE_SIZE) {
                break;
            }

            page += 1;
        }

        if (!articles.length) {
            throw new Error('No articles returned');
        }
    } catch (error) {
        articles = fallbackArticles;
        usedFallback = true;
    }

    blogState.allArticles = articles;
    blogState.usedFallback = usedFallback;
    syncSharedBlogContext();
    renderBlogPage(1);

    return blogState.allArticles;
};

window.wyattDaveBlogContext = [];
window.wyattDaveBlogContextReady = loadAllBlogs();

blogElements.prev.addEventListener('click', () => renderBlogPage(blogState.page - 1));
blogElements.next.addEventListener('click', () => renderBlogPage(blogState.page + 1));

const canvas = document.getElementById('spectrumGame');
const gameStatus = document.getElementById('gameStatus');
const context = canvas.getContext('2d');
const keys = new Set();
const colors = {
    background: '#000000',
    player: '#58e6ff',
    bullet: '#ffe761',
    alienA: '#26d07c',
    alienB: '#d946ef',
    alienC: '#1d2bff',
    barrier: '#f8f8f8',
    border: '#d62828'
};

const spriteRows = [
    ['00100100', '01111110', '11111111', '11011011', '11111111', '00100100', '01011010', '10000001'],
    ['00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101', '01000010'],
    ['00011000', '00111100', '01111110', '11011011', '11111111', '00100100', '01000010', '10000001']
];

const barrierSegments = [
    { x: 0, y: 0, width: 8, height: 3 },
    { x: 10, y: 0, width: 8, height: 3 },
    { x: 0, y: 3, width: 6, height: 3 },
    { x: 12, y: 3, width: 6, height: 3 }
];

const createBarriers = () => [44, 108, 172].map((x) => ({
    x,
    y: 150,
    health: 4,
    maxHealth: 4
}));

const formationBuilders = [
    () => [6, 8, 6, 8],
    () => [4, 6, 8, 6, 4],
    () => [8, 4, 8, 4, 8],
    () => [5, 9, 5, 9],
    () => [3, 6, 9, 6, 3],
    () => [7, 5, 7, 9]
];

const state = {
    player: { x: 120, y: 176, width: 14, height: 7, speed: 2.6 },
    bullet: null,
    enemyBullets: [],
    aliens: [],
    barriers: createBarriers(),
    direction: 1,
    alienSpeed: 0.45,
    enemyBulletSpeed: 1.6,
    enemyFireDelay: 1000,
    lastEnemyShotAt: 0,
    level: 1,
    score: 0,
    lives: 3,
    gameOver: false,
    lastShotAt: 0
};

const getRowPattern = (level) => {
    if (level === 1) {
        return [8, 8, 8, 8];
    }

    const basePattern = formationBuilders[Math.floor(Math.random() * formationBuilders.length)]();
    return basePattern.map((count) => Math.max(3, Math.min(10, count + Math.floor(Math.random() * 3) - 1)));
};

const spawnFormation = () => {
    state.aliens = [];
    const pattern = getRowPattern(state.level);
    const startY = 22;
    const rowGap = 14;

    pattern.forEach((count, rowIndex) => {
        const gapX = 14 + Math.floor(Math.random() * 5);
        const totalWidth = count * gapX;
        const baseX = Math.max(12, Math.round((canvas.width - totalWidth) / 2) + (Math.floor(Math.random() * 3) - 1) * 4);

        for (let column = 0; column < count; column += 1) {
            const spriteIndex = state.level === 1 ? rowIndex % spriteRows.length : Math.floor(Math.random() * spriteRows.length);
            const colorChoices = [colors.alienA, colors.alienB, colors.alienC, colors.spectrumYellow || '#ffe761'];
            state.aliens.push({
                x: baseX + column * gapX,
                y: startY + rowIndex * rowGap,
                row: spriteIndex,
                width: 12,
                height: 8,
                alive: true,
                color: state.level === 1 ? (rowIndex === 0 ? colors.alienC : rowIndex < 3 ? colors.alienB : colors.alienA) : colorChoices[Math.floor(Math.random() * colorChoices.length)]
            });
        }
    });
};

const startLevel = (message) => {
    state.player.x = 120;
    state.bullet = null;
    state.enemyBullets = [];
    state.barriers = createBarriers();
    state.direction = 1;
    state.alienSpeed = 0.45 + (state.level - 1) * 0.09;
    state.enemyBulletSpeed = 1.6 + (state.level - 1) * 0.18;
    state.enemyFireDelay = Math.max(180, 1000 - (state.level - 1) * 110);
    state.lastEnemyShotAt = 0;
    spawnFormation();
    gameStatus.textContent = message;
};

const resetGame = () => {
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.gameOver = false;
    state.lastShotAt = 0;
    startLevel('Level 1 booted. Invaders now return fire.');
};

const drawSprite = (sprite, x, y, color) => {
    context.fillStyle = color;
    sprite.forEach((row, rowIndex) => {
        row.split('').forEach((value, columnIndex) => {
            if (value === '1') {
                context.fillRect(x + columnIndex, y + rowIndex, 1, 1);
            }
        });
    });
};

const drawPlayer = () => {
    context.fillStyle = colors.player;
    context.fillRect(state.player.x, state.player.y, state.player.width, 3);
    context.fillRect(state.player.x + 2, state.player.y - 2, state.player.width - 4, 2);
    context.fillRect(state.player.x + 5, state.player.y - 4, 4, 2);
};

const drawBarriers = () => {
    state.barriers.forEach((barrier) => {
        const activeSegments = barrierSegments.slice(0, barrier.health);
        if (!activeSegments.length) {
            return;
        }

        context.fillStyle = colors.barrier;
        activeSegments.forEach((segment) => {
            context.fillRect(barrier.x + segment.x, barrier.y + segment.y, segment.width, segment.height);
        });
    });
};

const intersects = (projectile, target) => (
    projectile.x + projectile.width >= target.x
    && projectile.x <= target.x + target.width
    && projectile.y + projectile.height >= target.y
    && projectile.y <= target.y + target.height
);

const damageBarrier = (projectile) => {
    const hitBarrier = state.barriers.find((barrier) => barrier.health > 0
        && barrierSegments.slice(0, barrier.health).some((segment) => intersects(projectile, {
            x: barrier.x + segment.x,
            y: barrier.y + segment.y,
            width: segment.width,
            height: segment.height
        })));

    if (!hitBarrier) {
        return false;
    }

    hitBarrier.health -= 1;
    return true;
};

const updatePlayer = () => {
    if (keys.has('ArrowLeft')) {
        state.player.x = Math.max(8, state.player.x - state.player.speed);
    }
    if (keys.has('ArrowRight')) {
        state.player.x = Math.min(canvas.width - state.player.width - 8, state.player.x + state.player.speed);
    }
    if (keys.has(' ') && !state.bullet && performance.now() - state.lastShotAt > 220) {
        state.bullet = {
            x: state.player.x + state.player.width / 2 - 1,
            y: state.player.y - 6,
            width: 2,
            height: 6,
            speed: 3.2
        };
        state.lastShotAt = performance.now();
    }
};

const updateBullet = () => {
    if (!state.bullet) {
        return;
    }

    state.bullet.y -= state.bullet.speed;
    if (state.bullet.y < 0) {
        state.bullet = null;
        return;
    }

    if (damageBarrier(state.bullet)) {
        state.bullet = null;
        return;
    }

    const hitAlien = state.aliens.find((alien) => alien.alive
        && state.bullet.x >= alien.x
        && state.bullet.x <= alien.x + alien.width
        && state.bullet.y >= alien.y
        && state.bullet.y <= alien.y + alien.height);

    if (hitAlien) {
        hitAlien.alive = false;
        state.bullet = null;
        state.score += 25;
        state.alienSpeed += 0.015;
        if (state.aliens.every((alien) => !alien.alive)) {
            state.level += 1;
            startLevel(`Level ${state.level} loaded. Formation randomized.`);
        }
    }
};

const updateEnemyBullets = () => {
    state.enemyBullets = state.enemyBullets.filter((bullet) => {
        bullet.y += bullet.speed;

        if (damageBarrier(bullet)) {
            return false;
        }

        if (
            bullet.x + bullet.width >= state.player.x
            && bullet.x <= state.player.x + state.player.width
            && bullet.y + bullet.height >= state.player.y - 4
            && bullet.y <= state.player.y + state.player.height
        ) {
            state.lives -= 1;
            if (state.lives <= 0) {
                state.gameOver = true;
                gameStatus.textContent = `Game over on level ${state.level}. Final score ${state.score}. Press R to reboot.`;
            } else {
                startLevel(`Hit taken. Lives left: ${state.lives}. Level ${state.level} restarted.`);
            }
            return false;
        }

        return bullet.y < canvas.height - 4;
    });
};

const fireEnemyBullets = (now) => {
    if (now - state.lastEnemyShotAt < state.enemyFireDelay) {
        return;
    }

    const aliveAliens = state.aliens.filter((alien) => alien.alive);
    if (!aliveAliens.length) {
        return;
    }

    const columns = new Map();
    aliveAliens.forEach((alien) => {
        const columnKey = Math.round(alien.x / 14);
        const current = columns.get(columnKey);
        if (!current || alien.y > current.y) {
            columns.set(columnKey, alien);
        }
    });

    const shooters = Array.from(columns.values()).sort(() => Math.random() - 0.5);
    const shotCount = Math.min(1 + Math.floor((state.level - 1) / 2), 3, shooters.length);
    for (let index = 0; index < shotCount; index += 1) {
        const shooter = shooters[index];
        state.enemyBullets.push({
            x: shooter.x + Math.floor(shooter.width / 2),
            y: shooter.y + shooter.height + 2,
            width: 2,
            height: 6,
            speed: state.enemyBulletSpeed
        });
    }

    state.lastEnemyShotAt = now;
};

const updateAliens = () => {
    const aliveAliens = state.aliens.filter((alien) => alien.alive);
    if (!aliveAliens.length) {
        return;
    }

    let shouldDrop = false;
    aliveAliens.forEach((alien) => {
        alien.x += state.direction * state.alienSpeed;
        if (alien.x <= 8 || alien.x + alien.width >= canvas.width - 8) {
            shouldDrop = true;
        }
    });

    if (shouldDrop) {
        state.direction *= -1;
        aliveAliens.forEach((alien) => {
            alien.y += 8;
        });
    }

    const invaded = aliveAliens.some((alien) => alien.y + alien.height >= 156);
    if (invaded) {
        state.lives -= 1;
        if (state.lives <= 0) {
            state.gameOver = true;
            gameStatus.textContent = `Game over on level ${state.level}. Final score ${state.score}. Press R to reboot.`;
        } else {
            startLevel(`Shield line breached. Lives left: ${state.lives}.`);
        }
    }
};

const isSpectrumActive = () => body.classList.contains('view-workspace') && spectrumSection.classList.contains('active');

const draw = () => {
    context.fillStyle = colors.background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = colors.border;
    context.fillRect(0, 0, canvas.width, 4);
    context.fillRect(0, canvas.height - 4, canvas.width, 4);
    context.fillRect(0, 0, 4, canvas.height);
    context.fillRect(canvas.width - 4, 0, 4, canvas.height);

    context.fillStyle = colors.barrier;
    context.font = '8px "Press Start 2P"';
    context.fillText(`SCORE ${state.score}`, 12, 14);
    context.fillText(`LVL ${state.level}`, 100, 14);
    context.fillText(`LIVES ${state.lives}`, 160, 14);

    drawBarriers();
    drawPlayer();

    state.aliens.forEach((alien) => {
        if (alien.alive) {
            drawSprite(spriteRows[alien.row % spriteRows.length], alien.x, alien.y, alien.color);
        }
    });

    if (state.bullet) {
        context.fillStyle = colors.bullet;
        context.fillRect(state.bullet.x, state.bullet.y, state.bullet.width, state.bullet.height);
    }

    state.enemyBullets.forEach((bullet) => {
        context.fillStyle = colors.spectrumRed || '#d62828';
        context.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    });

    if (state.gameOver) {
        context.fillStyle = '#d946ef';
        context.fillRect(26, 74, 204, 42);
        context.fillStyle = colors.background;
        context.fillText('GAME OVER', 56, 96);
        context.fillText('PRESS R', 72, 110);
    }
};

const gameLoop = () => {
    if (isSpectrumActive() && !state.gameOver) {
        const now = performance.now();
        updatePlayer();
        updateBullet();
        fireEnemyBullets(now);
        updateEnemyBullets();
        updateAliens();
    }
    draw();
    requestAnimationFrame(gameLoop);
};

window.addEventListener('keydown', (event) => {
    const editableTarget = isEditableTarget(event.target);

    if (!editableTarget && (event.key === ' ' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
    }
    if (event.key.toLowerCase() === 'r' && state.gameOver) {
        resetGame();
    }
    keys.add(event.key);
});

window.addEventListener('keyup', (event) => {
    keys.delete(event.key);
});

resetGame();
gameLoop();

// --- Global search across portfolio sections + dev.to articles ---
const searchInput = document.getElementById('globalSearchInput');
const searchResultsEl = document.getElementById('globalSearchResults');

const tryUnlockPackageGenerator = () => {
    if (!settingsLauncher || !searchInput) {
        return false;
    }

    if (searchInput.value.trim().toLowerCase() !== PACKAGE_UNLOCK_TOKEN) {
        return false;
    }

    revealPackageGenerator();
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
};

if (settingsLauncher) {
    settingsLauncher.addEventListener('click', () => {
        tryUnlockPackageGenerator();
    });
}

if (searchInput && searchResultsEl) {
    const stripMarkdown = (md = '') => String(md)
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*_>`-]/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const buildPortfolioIndex = () => {
        const entries = configuredSections.map((section) => ({
            kind: 'portfolio',
            id: section.id,
            title: section.title,
            file: section.dataFile,
            snippet: stripMarkdown(section.markdown).slice(0, 160),
            haystack: [
                section.id,
                section.title,
                (section.meta || []).map((m) => `${m.label} ${m.href || ''}`).join(' '),
                stripMarkdown(section.markdown)
            ].join(' ').toLowerCase()
        }));
        entries.push({
            kind: 'portfolio',
            id: 'blogs',
            title: 'Blogs',
            file: blogSection.dataset.file,
            snippet: 'Recent dev.to writing archive.',
            haystack: 'blogs writing dev.to archive articles'
        });
        entries.push({
            kind: 'portfolio',
            id: 'spectrum',
            title: 'Spectrum Invaders',
            file: spectrumSection.dataset.file,
            snippet: 'Sinclair Spectrum-inspired mini-game.',
            haystack: 'spectrum invaders sinclair game canvas mini-game'
        });
        return entries;
    };

    let portfolioIndex = buildPortfolioIndex();
    let blogIndex = null;
    let blogIndexPromise = null;

    const loadBlogIndex = () => {
        if (blogIndex) return Promise.resolve(blogIndex);
        if (blogIndexPromise) return blogIndexPromise;
        blogIndexPromise = fetch('https://dev.to/api/articles?username=wyattdave&per_page=1000')
            .then((r) => r.ok ? r.json() : Promise.reject(new Error('dev.to request failed')))
            .then((articles) => {
                const list = Array.isArray(articles) && articles.length ? articles : fallbackArticles;
                blogIndex = list.map((a) => ({
                    kind: 'blog',
                    title: a.title,
                    url: a.url,
                    date: a.readable_publish_date || '',
                    snippet: a.description || '',
                    haystack: [
                        a.title,
                        a.description || '',
                        (a.tag_list || []).join(' ')
                    ].join(' ').toLowerCase()
                }));
                return blogIndex;
            })
            .catch(() => {
                blogIndex = fallbackArticles.map((a) => ({
                    kind: 'blog',
                    title: a.title,
                    url: a.url,
                    date: a.readable_publish_date || '',
                    snippet: a.description || '',
                    haystack: [a.title, a.description || '', (a.tag_list || []).join(' ')].join(' ').toLowerCase()
                }));
                return blogIndex;
            });
        return blogIndexPromise;
    };

    const closeResults = () => {
        searchResultsEl.hidden = true;
        searchResultsEl.innerHTML = '';
        searchInput.setAttribute('aria-expanded', 'false');
    };

    const renderResults = (query, portfolioMatches, blogMatches, { loadingBlogs = false } = {}) => {
        if (!query) {
            closeResults();
            return;
        }

        const parts = [];
        if (portfolioMatches.length) {
            parts.push('<div class="pa-search-group-label">Portfolio</div>');
            portfolioMatches.slice(0, 8).forEach((item) => {
                parts.push(`
                    <button type="button" class="pa-search-item" role="option"
                        data-kind="portfolio" data-section="${escapeHtml(item.id)}">
                        <span class="pa-search-item-title">${escapeHtml(item.title)}</span>
                        <span class="pa-search-item-meta"><span>${escapeHtml(item.file)}</span></span>
                        ${item.snippet ? `<span class="pa-search-item-snippet">${escapeHtml(item.snippet)}</span>` : ''}
                    </button>
                `);
            });
        }

        if (blogMatches.length) {
            parts.push('<div class="pa-search-group-label">Blogs (dev.to)</div>');
            blogMatches.slice(0, 12).forEach((item) => {
                parts.push(`
                    <button type="button" class="pa-search-item" role="option"
                        data-kind="blog" data-url="${escapeHtml(item.url)}">
                        <span class="pa-search-item-title">${escapeHtml(item.title)}</span>
                        <span class="pa-search-item-meta"><span>${escapeHtml(item.date)}</span><span>Opens in new tab</span></span>
                        ${item.snippet ? `<span class="pa-search-item-snippet">${escapeHtml(item.snippet)}</span>` : ''}
                    </button>
                `);
            });
        }

        if (loadingBlogs && !blogMatches.length) {
            parts.push('<div class="pa-search-loading">Loading blog index…</div>');
        }

        if (!parts.length) {
            parts.push('<div class="pa-search-empty">No matches found.</div>');
        }

        searchResultsEl.innerHTML = parts.join('');
        searchResultsEl.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
    };

    const runSearch = (rawQuery) => {
        const query = rawQuery.trim().toLowerCase();
        if (!query) {
            closeResults();
            return;
        }

        // Refresh portfolio index in case file labels changed
        portfolioIndex = buildPortfolioIndex();
        const tokens = query.split(/\s+/).filter(Boolean);
        const matches = (haystack) => tokens.every((t) => haystack.includes(t));

        const portfolioMatches = portfolioIndex.filter((item) => matches(item.haystack));
        const blogMatches = blogIndex ? blogIndex.filter((item) => matches(item.haystack)) : [];

        renderResults(query, portfolioMatches, blogMatches, { loadingBlogs: !blogIndex });

        if (!blogIndex) {
            loadBlogIndex().then(() => {
                if (searchInput.value.trim().toLowerCase() === query) {
                    const updated = blogIndex.filter((item) => matches(item.haystack));
                    renderResults(query, portfolioMatches, updated);
                }
            });
        }
    };

    searchInput.addEventListener('input', (event) => {
        runSearch(event.target.value);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            runSearch(searchInput.value);
        }
        loadBlogIndex();
    });

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeResults();
            searchInput.blur();
        }
    });

    searchResultsEl.addEventListener('mousedown', (event) => {
        // mousedown so we act before the input loses focus
        const item = event.target.closest('.pa-search-item');
        if (!item) return;
        event.preventDefault();
        if (item.dataset.kind === 'portfolio') {
            transitionToWorkspace(item.dataset.section);
        } else if (item.dataset.kind === 'blog') {
            window.open(item.dataset.url, '_blank', 'noopener,noreferrer');
        }
        searchInput.value = '';
        closeResults();
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('#globalSearch')) {
            closeResults();
        }
    });
}


